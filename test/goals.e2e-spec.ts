import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Goals (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let accountId: number;
  let manualGoalId: number;
  let linkedGoalId: number;
  const email = 'goals-e2e@test.crecik';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    user = await registerTestUser(ctx.server, email, currencyId);

    const accountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set(auth())
      .send({ name: 'Goal Test Account', currencyId, startBalance: 400 });
    accountId = accountRes.body.id as number;
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${user.token}` };
  }

  describe('POST /api/users/me/goals', () => {
    it('201 - creates a manual goal starting at zero progress', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/goals')
        .set(auth())
        .send({ name: 'Emergency fund', targetAmount: 1000 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: 'Emergency fund',
        targetAmount: 1000,
        currentAmount: 0,
        remaining: 1000,
        percentComplete: 0,
        accountId: null,
        isAchieved: false,
      });
      manualGoalId = res.body.id as number;
    });

    it('201 - creates a goal linked to an account and takes its balance as progress', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/goals')
        .set(auth())
        .send({ name: 'New laptop', targetAmount: 1000, accountId });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'New laptop',
        targetAmount: 1000,
        currentAmount: 400,
        remaining: 600,
        percentComplete: 40,
        accountId,
        accountName: 'Goal Test Account',
      });
      linkedGoalId = res.body.id as number;
    });

    it('400 - missing targetAmount', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/goals')
        .set(auth())
        .send({ name: 'No target' });

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toHaveProperty('targetAmount');
    });

    it('404 - linked account does not belong to the user', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/goals')
        .set(auth())
        .send({ name: 'Bad link', targetAmount: 100, accountId: 999999 });

      expect(res.status).toBe(404);
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/goals')
        .send({ name: 'No auth', targetAmount: 100 });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me/goals', () => {
    it('200 - lists goals with computed progress', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/goals')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const manual = (
        res.body as Array<{ id: number; currentAmount: number }>
      ).find((g) => g.id === manualGoalId);
      expect(manual).toMatchObject({ currentAmount: 0 });
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get('/api/users/me/goals');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/me/goals/:goalId', () => {
    it('200 - adds a manual contribution and marks the goal achieved', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/goals/${manualGoalId}`)
        .set(auth())
        .send({ currentAmount: 1000 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        currentAmount: 1000,
        remaining: 0,
        percentComplete: 100,
        isAchieved: true,
      });
    });

    it('404 - goal not found', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/goals/999999')
        .set(auth())
        .send({ currentAmount: 100 });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/goals/:goalId', () => {
    it('204 - deletes the goal', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/goals/${manualGoalId}`)
        .set(auth());

      expect(res.status).toBe(204);
    });

    it('204 - deletes the linked goal too', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/goals/${linkedGoalId}`)
        .set(auth());

      expect(res.status).toBe(204);
    });

    it('404 - non-existent goal', async () => {
      const res = await request(ctx.server)
        .delete('/api/users/me/goals/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });
});
