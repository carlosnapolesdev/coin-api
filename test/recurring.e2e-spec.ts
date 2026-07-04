import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Recurring transactions (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let categoryId: number;
  let accountId: number;
  let recurringId: number;
  const email = 'recurring-e2e@test.coinflow';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    user = await registerTestUser(ctx.server, email, currencyId);

    const catRes = await request(ctx.server)
      .get('/api/users/me/categories')
      .set({ Authorization: `Bearer ${user.token}` });
    const categories = catRes.body as Array<{ id: number; type: string }>;
    const expenseCategory = categories.find((c) => c.type === 'EXPENSE');
    if (!expenseCategory) throw new Error('No EXPENSE category for test user');
    categoryId = expenseCategory.id;

    const accountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set({ Authorization: `Bearer ${user.token}` })
      .send({ name: 'Recurring Test Account', currencyId, startBalance: 0 });
    accountId = accountRes.body.id as number;
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  describe('POST /api/users/me/recurring', () => {
    it('201 - creates a recurring template with nextRunDate set to startDate', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/recurring')
        .set(auth())
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: 1200,
          frequency: 'MONTHLY',
          startDate: '2026-08-01',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        accountId,
        categoryId,
        type: 'EXPENSE',
        amount: 1200,
        frequency: 'MONTHLY',
        interval: 1,
        nextRunDate: '2026-08-01',
        isActive: true,
      });
      recurringId = res.body.id as number;
    });

    it('400 - missing accountId', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/recurring')
        .set(auth())
        .send({
          type: 'EXPENSE',
          amount: 100,
          frequency: 'MONTHLY',
          startDate: '2026-08-01',
        });

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toHaveProperty('accountId');
    });

    it('404 - account does not belong to the user', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/recurring')
        .set(auth())
        .send({
          accountId: 999999,
          type: 'EXPENSE',
          amount: 100,
          frequency: 'MONTHLY',
          startDate: '2026-08-01',
        });

      expect(res.status).toBe(404);
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/recurring')
        .send({
          accountId,
          type: 'EXPENSE',
          amount: 100,
          frequency: 'MONTHLY',
          startDate: '2026-08-01',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me/recurring', () => {
    it('200 - lists templates for the user', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/recurring')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(
        (res.body as Array<{ id: number }>).some((r) => r.id === recurringId),
      ).toBe(true);
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get('/api/users/me/recurring');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/me/recurring/:id', () => {
    it('200 - updates the amount', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/recurring/${recurringId}`)
        .set(auth())
        .send({ amount: 1500 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ amount: 1500 });
    });

    it('404 - template not found', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/recurring/999999')
        .set(auth())
        .send({ amount: 100 });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/users/me/recurring/:id/run', () => {
    it('201 - materializes the template into a real transaction now', async () => {
      const res = await request(ctx.server)
        .post(`/api/users/me/recurring/${recurringId}/run`)
        .set(auth());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        accountId,
        categoryId,
        type: 'EXPENSE',
        amount: 1500,
      });

      const templateRes = await request(ctx.server)
        .get('/api/users/me/recurring')
        .set(auth());
      const template = (
        templateRes.body as Array<{ id: number; nextRunDate: string }>
      ).find((r) => r.id === recurringId);
      expect(template?.nextRunDate).toBe('2026-09-01');
    });

    it('404 - template not found', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/recurring/999999/run')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/recurring/:id', () => {
    it('204 - deletes the template', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/recurring/${recurringId}`)
        .set(auth());

      expect(res.status).toBe(204);
    });

    it('404 - non-existent template', async () => {
      const res = await request(ctx.server)
        .delete('/api/users/me/recurring/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });
});
