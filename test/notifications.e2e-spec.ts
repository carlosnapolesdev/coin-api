import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Notifications (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let otherUser: TestUser;
  let currencyId: number;
  const email = 'notifications-e2e@test.crecik';
  const otherEmail = 'notifications-e2e-other@test.crecik';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    await cleanupUser(ctx.prisma, otherEmail);
    user = await registerTestUser(ctx.server, email, currencyId);
    otherUser = await registerTestUser(ctx.server, otherEmail, currencyId);
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await cleanupUser(ctx.prisma, otherEmail);
    await ctx.app.close();
  });

  const auth = (u: TestUser = user) => ({
    Authorization: `Bearer ${u.token}`,
  });

  const seedNotification = async (
    prismaUser: TestUser,
    overrides: {
      type?: string;
      isRead?: boolean;
      dedupeKey: string;
    },
  ): Promise<{ id: number; dedupeKey: string }> => {
    const dbUser = await ctx.prisma.user.findFirst({
      where: { id: BigInt(prismaUser.id) },
    });
    if (!dbUser) throw new Error('seed user missing');
    const created = await ctx.prisma.notification.create({
      data: {
        userId: dbUser.id,
        type: overrides.type ?? 'BUDGET_EXCEEDED',
        title: 'Budget exceeded',
        body: 'You exceeded Food by 20%',
        dedupeKey: overrides.dedupeKey,
        isRead: overrides.isRead ?? false,
      },
    });
    return { id: Number(created.id), dedupeKey: created.dedupeKey };
  };

  describe('GET /api/users/me/notifications', () => {
    it('401 - no token', async () => {
      const res = await request(ctx.server).get('/api/users/me/notifications');
      expect(res.status).toBe(401);
    });

    it('200 - returns an empty list when the user has none', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/notifications')
        .set(auth(otherUser));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('200 - lists notifications newest first', async () => {
      const older = await seedNotification(user, {
        dedupeKey: `e2e-budget-old-${Date.now()}`,
        isRead: false,
      });
      await new Promise((r) => setTimeout(r, 5));
      const newer = await seedNotification(user, {
        dedupeKey: `e2e-budget-new-${Date.now()}`,
        isRead: false,
      });

      const res = await request(ctx.server)
        .get('/api/users/me/notifications')
        .set(auth());

      expect(res.status).toBe(200);
      const body = res.body as Array<{ id: number }>;
      expect(body.map((n) => n.id)).toContain(older.id);
      expect(body.map((n) => n.id)).toContain(newer.id);
      const newerIdx = body.findIndex((n) => n.id === newer.id);
      const olderIdx = body.findIndex((n) => n.id === older.id);
      expect(newerIdx).toBeLessThan(olderIdx);
    });

    it('200 - unread=true returns only unread notifications', async () => {
      const marked = await seedNotification(user, {
        dedupeKey: `e2e-read-${Date.now()}`,
        isRead: true,
      });
      const unread = await seedNotification(user, {
        dedupeKey: `e2e-unread-${Date.now()}`,
        isRead: false,
      });

      const res = await request(ctx.server)
        .get('/api/users/me/notifications?unread=true')
        .set(auth());

      expect(res.status).toBe(200);
      const body = res.body as Array<{ id: number; isRead: boolean }>;
      expect(body.every((n) => !n.isRead)).toBe(true);
      expect(body.map((n) => n.id)).toContain(unread.id);
      expect(body.map((n) => n.id)).not.toContain(marked.id);
    });

    it('200 - isolation: does not leak another user notifications', async () => {
      const fromOther = await seedNotification(otherUser, {
        dedupeKey: `e2e-isolation-${Date.now()}`,
      });

      const res = await request(ctx.server)
        .get('/api/users/me/notifications')
        .set(auth());

      const body = res.body as Array<{ id: number }>;
      expect(body.map((n) => n.id)).not.toContain(fromOther.id);
    });
  });

  describe('PATCH /api/users/me/notifications/:id/read', () => {
    it('200 - marks a single notification as read', async () => {
      const seeded = await seedNotification(user, {
        dedupeKey: `e2e-mark-${Date.now()}`,
        isRead: false,
      });

      const res = await request(ctx.server)
        .patch(`/api/users/me/notifications/${seeded.id}/read`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: seeded.id, isRead: true });

      const dbRow = await ctx.prisma.notification.findFirst({
        where: { id: BigInt(seeded.id) },
      });
      expect(dbRow?.isRead).toBe(true);
    });

    it('404 - when the notification belongs to another user', async () => {
      const fromOther = await seedNotification(otherUser, {
        dedupeKey: `e2e-cross-owner-${Date.now()}`,
      });

      const res = await request(ctx.server)
        .patch(`/api/users/me/notifications/${fromOther.id}/read`)
        .set(auth());

      expect(res.status).toBe(404);
    });

    it('404 - non-existent id', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/notifications/999999/read')
        .set(auth());
      expect(res.status).toBe(404);
    });

    it('400 - non-numeric id', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/notifications/notanumber/read')
        .set(auth());
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/users/me/notifications/read-all', () => {
    it('200 - marks every unread notification for the user and returns the count', async () => {
      await seedNotification(user, {
        dedupeKey: `e2e-ra-${Date.now()}-1`,
        isRead: false,
      });
      await seedNotification(user, {
        dedupeKey: `e2e-ra-${Date.now()}-2`,
        isRead: false,
      });
      await seedNotification(user, {
        dedupeKey: `e2e-ra-${Date.now()}-3`,
        isRead: true,
      });

      const res = await request(ctx.server)
        .post('/api/users/me/notifications/read-all')
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: expect.any(Number) });

      const unread = await request(ctx.server)
        .get('/api/users/me/notifications?unread=true')
        .set(auth());
      expect(unread.body).toEqual([]);
    });

    it('200 - returns updated=0 when there is nothing to mark', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/notifications/read-all')
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 0 });
    });

    it('200 - does not affect notifications belonging to another user', async () => {
      await seedNotification(otherUser, {
        dedupeKey: `e2e-ra-other-${Date.now()}`,
        isRead: false,
      });

      const res = await request(ctx.server)
        .post('/api/users/me/notifications/read-all')
        .set(auth());

      expect(res.status).toBe(200);
      const stillUnread = await request(ctx.server)
        .get('/api/users/me/notifications?unread=true')
        .set(auth(otherUser));
      expect((stillUnread.body as Array<unknown>).length).toBeGreaterThan(0);
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).post(
        '/api/users/me/notifications/read-all',
      );
      expect(res.status).toBe(401);
    });
  });
});
