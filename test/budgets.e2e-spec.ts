import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Budgets (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let categoryId: number;
  let budgetId: number;
  const email = 'budgets-e2e@test.crecik';

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
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  describe('POST /api/users/me/budgets', () => {
    it('201 - creates a budget', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/budgets')
        .set(auth())
        .send({ categoryId, amount: 200 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        categoryId,
        amount: 200,
        period: 'MONTHLY',
        spent: 0,
        remaining: 200,
        percentUsed: 0,
        active: true,
      });
      budgetId = res.body.id as number;
    });

    it('400 - missing categoryId', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/budgets')
        .set(auth())
        .send({ amount: 200 });

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toHaveProperty('categoryId');
    });

    it('404 - category does not belong to the user', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/budgets')
        .set(auth())
        .send({ categoryId: 999999, amount: 100 });

      expect(res.status).toBe(404);
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/budgets')
        .send({ categoryId, amount: 100 });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me/budgets', () => {
    it('200 - includes spent/remaining/percentUsed computed from expenses', async () => {
      const accountRes = await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(auth())
        .send({ name: 'Budget Test Account', currencyId, startBalance: 0 });
      const accountId = accountRes.body.id as number;

      const today = new Date().toISOString().slice(0, 10);
      await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(auth())
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: 50,
          effectiveDate: today,
        });

      const res = await request(ctx.server)
        .get('/api/users/me/budgets')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const budget = (
        res.body as Array<{
          id: number;
          spent: number;
          remaining: number;
          percentUsed: number;
        }>
      ).find((b) => b.id === budgetId);
      expect(budget).toMatchObject({
        spent: 50,
        remaining: 150,
        percentUsed: 25,
      });
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get('/api/users/me/budgets');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/me/budgets/:budgetId', () => {
    it('200 - updates the amount', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/budgets/${budgetId}`)
        .set(auth())
        .send({ amount: 300 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ amount: 300 });
    });

    it('404 - budget not found', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/budgets/999999')
        .set(auth())
        .send({ amount: 100 });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/budgets/:budgetId', () => {
    it('204 - deletes the budget', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/budgets/${budgetId}`)
        .set(auth());

      expect(res.status).toBe(204);
    });

    it('404 - non-existent budget', async () => {
      const res = await request(ctx.server)
        .delete('/api/users/me/budgets/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });
});
