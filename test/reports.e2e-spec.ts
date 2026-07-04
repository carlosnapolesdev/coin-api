import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Reports (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let accountId: number;
  let incomeCategoryId: number;
  let expenseCategoryId: number;
  const email = 'reports-e2e@test.coinflow';

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    user = await registerTestUser(ctx.server, email, currencyId);

    const catRes = await request(ctx.server)
      .get('/api/users/me/categories')
      .set(auth());
    const categories = catRes.body as Array<{ id: number; type: string }>;
    const incomeCategory = categories.find((c) => c.type === 'INCOME');
    const expenseCategory = categories.find((c) => c.type === 'EXPENSE');
    if (!incomeCategory || !expenseCategory) {
      throw new Error('Missing INCOME/EXPENSE category for test user');
    }
    incomeCategoryId = incomeCategory.id;
    expenseCategoryId = expenseCategory.id;

    const accountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set(auth())
      .send({ name: 'Reports Test Account', currencyId, startBalance: 1000 });
    accountId = accountRes.body.id as number;

    const today = new Date().toISOString().slice(0, 10);
    await request(ctx.server)
      .post('/api/users/me/transactions')
      .set(auth())
      .send({
        accountId,
        categoryId: incomeCategoryId,
        type: 'INCOME',
        amount: 500,
        effectiveDate: today,
      });
    await request(ctx.server)
      .post('/api/users/me/transactions')
      .set(auth())
      .send({
        accountId,
        categoryId: expenseCategoryId,
        type: 'EXPENSE',
        amount: 150,
        effectiveDate: today,
      });
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  const currentMonth = () => new Date().toISOString().slice(0, 7);

  describe('GET /api/users/me/reports/income-expense', () => {
    it('200 - returns the current month income/expense/net', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/reports/income-expense')
        .set(auth());

      expect(res.status).toBe(200);
      const point = (res.body as Array<{ month: string }>).find(
        (p) => p.month === currentMonth(),
      );
      expect(point).toMatchObject({ income: 500, expense: 150, net: 350 });
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get(
        '/api/users/me/reports/income-expense',
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me/reports/categories', () => {
    it('200 - returns expense totals by category', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/reports/categories')
        .set(auth());

      expect(res.status).toBe(200);
      const entry = (
        res.body as Array<{ categoryId: number; total: number }>
      ).find((c) => c.categoryId === expenseCategoryId);
      expect(entry).toMatchObject({ total: 150 });
    });
  });

  describe('GET /api/users/me/reports/net-worth', () => {
    it('200 - returns the running balance including the account start balance', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/reports/net-worth')
        .set(auth());

      expect(res.status).toBe(200);
      const point = (
        res.body as Array<{ month: string; balance: number }>
      ).find((p) => p.month === currentMonth());
      expect(point).toMatchObject({ balance: 1350 });
    });
  });
});
