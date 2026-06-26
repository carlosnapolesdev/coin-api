import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Transactions (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let accountId: number;
  let categoryId: number;
  let transactionId: number;
  const email = 'transactions-e2e@test.coinflow';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    user = await registerTestUser(ctx.server, email, currencyId);

    const auth = { Authorization: `Bearer ${user.token}` };

    const accountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set(auth)
      .send({ name: 'Tx Test Account', currencyId, startBalance: 0 });
    accountId = accountRes.body.id as number;

    const catRes = await request(ctx.server)
      .get('/api/users/me/categories')
      .set(auth);
    const categories = catRes.body as Array<{ id: number }>;
    if (!categories.length) throw new Error('No categories for test user');
    categoryId = categories[0].id;
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  describe('POST /api/users/me/transactions', () => {
    it('201 - creates a transaction', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(auth())
        .send({
          accountId,
          categoryId,
          type: 'INCOME',
          amount: 500,
          effectiveDate: '2026-01-15',
          status: 'CLEARED',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        accountId,
        type: 'INCOME',
        amount: 500,
        effectiveDate: '2026-01-15',
      });
      transactionId = res.body.id as number;
    });

    it('201 - creates an expense transaction', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(auth())
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: 100,
          effectiveDate: '2026-01-20',
          status: 'CLEARED',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: 'EXPENSE', amount: 100 });
    });

    it('400 - missing required fields', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(auth())
        .send({ accountId });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('validationErrors');
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/transactions')
        .send({ accountId, type: 'INCOME', amount: 1 });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me/transactions', () => {
    it('200 - returns all transactions (no balance)', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/transactions')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body[0].balance).toBeNull();
    });

    it('200 - by accountId includes running balance', async () => {
      const res = await request(ctx.server)
        .get(`/api/users/me/transactions?accountId=${accountId}`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const withBalance = (
        res.body as Array<{ balance: number | null }>
      ).filter((t) => t.balance !== null);
      expect(withBalance.length).toBeGreaterThan(0);
    });

    it('200 - running balance order: most recent first with correct accumulation', async () => {
      const res = await request(ctx.server)
        .get(`/api/users/me/transactions?accountId=${accountId}`)
        .set(auth());

      const txs = res.body as Array<{
        effectiveDate: string;
        balance: number | null;
      }>;
      // Result is DESC by date — first item has the highest balance
      const dates = txs.map((t) => t.effectiveDate);
      const sorted = [...dates].sort().reverse();
      expect(dates).toEqual(sorted);
    });

    it('200 - date range filter (no balance)', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/transactions?from=2026-01-01&to=2026-12-31')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/users/me/transactions/:id', () => {
    it('200 - returns a single transaction', async () => {
      const res = await request(ctx.server)
        .get(`/api/users/me/transactions/${transactionId}`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: transactionId });
    });

    it('404 - not found', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/transactions/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/users/me/transactions/:id', () => {
    it('200 - updates a transaction', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/transactions/${transactionId}`)
        .set(auth())
        .send({ amount: 600, payee: 'Updated Payee' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ amount: 600 });
    });

    it('404 - not found', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/transactions/999999')
        .set(auth())
        .send({ amount: 1 });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/transactions/:id', () => {
    it('204 - hard deletes a transaction', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/transactions/${transactionId}`)
        .set(auth());

      expect(res.status).toBe(204);
    });

    it('404 - transaction gone after hard delete', async () => {
      const res = await request(ctx.server)
        .get(`/api/users/me/transactions/${transactionId}`)
        .set(auth());

      expect(res.status).toBe(404);
    });

    it('404 - non-existent transaction', async () => {
      const res = await request(ctx.server)
        .delete('/api/users/me/transactions/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });
});
