import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Reconciliations (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let accountId: number;
  const email = 'reconciliations-e2e@test.crecik';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    user = await registerTestUser(ctx.server, email, currencyId);

    const accountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set({ Authorization: `Bearer ${user.token}` })
      .send({ name: 'Recon Test Account', currencyId, startBalance: 100 });

    accountId = (accountRes.body as { id: number }).id;

    await request(ctx.server)
      .post('/api/users/me/transactions')
      .set({ Authorization: `Bearer ${user.token}` })
      .send({
        accountId,
        type: 'INCOME',
        amount: 50,
        effectiveDate: '2024-06-15',
        payee: 'Salary',
      });

    await request(ctx.server)
      .post('/api/users/me/transactions')
      .set({ Authorization: `Bearer ${user.token}` })
      .send({
        accountId,
        type: 'EXPENSE',
        amount: 20,
        effectiveDate: '2024-06-20',
        payee: 'Groceries',
      });
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  describe('POST /api/users/me/accounts/:accountId/reconciliations', () => {
    it('201 - opens a balanced reconciliation', async () => {
      const res = await request(ctx.server)
        .post(`/api/users/me/accounts/${accountId}/reconciliations`)
        .set(auth())
        .send({ statementDate: '2024-06-30', statementBalance: 130 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        accountId,
        statementBalance: 130,
        clearedBalance: 130,
        difference: 0,
        isCompleted: false,
      });
    });

    it('400 - rejects missing fields', async () => {
      const res = await request(ctx.server)
        .post(`/api/users/me/accounts/${accountId}/reconciliations`)
        .set(auth())
        .send({ statementDate: '2024-06-30' });

      expect(res.status).toBe(400);
    });

    it('404 - account not found', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/accounts/999999/reconciliations')
        .set(auth())
        .send({ statementDate: '2024-06-30', statementBalance: 0 });

      expect(res.status).toBe(404);
    });
  });

  describe('GET .../reconciliations/:id', () => {
    let reconciliationId: number;

    beforeAll(async () => {
      const opened = await request(ctx.server)
        .post(`/api/users/me/accounts/${accountId}/reconciliations`)
        .set(auth())
        .send({ statementDate: '2024-06-30', statementBalance: 100 });
      reconciliationId = (opened.body as { id: number }).id;
    });

    it('200 - returns summary with clearedCount and pendingCount', async () => {
      const res = await request(ctx.server)
        .get(
          `/api/users/me/accounts/${accountId}/reconciliations/${reconciliationId}`,
        )
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: reconciliationId,
        accountId,
        statementBalance: 100,
        clearedCount: 2,
        pendingCount: 0,
      });
      expect(typeof res.body.clearedBalance).toBe('number');
      expect(typeof res.body.difference).toBe('number');
    });
  });

  describe('POST .../reconciliations/:id/complete', () => {
    it('400 - rejects when difference is not 0', async () => {
      const opened = await request(ctx.server)
        .post(`/api/users/me/accounts/${accountId}/reconciliations`)
        .set(auth())
        .send({ statementDate: '2024-06-30', statementBalance: 99 });
      const id = (opened.body as { id: number }).id;

      const res = await request(ctx.server)
        .post(
          `/api/users/me/accounts/${accountId}/reconciliations/${id}/complete`,
        )
        .set(auth());

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Reconciliation is not balanced');
    });

    it('200 - completes when difference is 0', async () => {
      const opened = await request(ctx.server)
        .post(`/api/users/me/accounts/${accountId}/reconciliations`)
        .set(auth())
        .send({ statementDate: '2024-06-30', statementBalance: 130 });
      const id = (opened.body as { id: number }).id;

      const res = await request(ctx.server)
        .post(
          `/api/users/me/accounts/${accountId}/reconciliations/${id}/complete`,
        )
        .set(auth());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id,
        isCompleted: true,
        difference: 0,
      });
      expect(res.body.completedAt).toBeTruthy();
    });
  });
});
