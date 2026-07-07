import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Accounts (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let accountId: number;
  const email = 'accounts-e2e@test.coinflow';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    user = await registerTestUser(ctx.server, email, currencyId);
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  describe('POST /api/users/me/accounts', () => {
    it('201 - creates an account', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(auth())
        .send({ name: 'Test Account', currencyId });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: 'Test Account',
        active: true,
        currencyId,
      });
      accountId = res.body.id as number;
    });

    it('400 - missing name', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(auth())
        .send({ currencyId });

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toHaveProperty('name');
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/accounts')
        .send({ name: 'No Auth', currencyId });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me/accounts', () => {
    it('200 - returns accounts list', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/accounts')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('200 - includeInactive=true shows all accounts', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/accounts?includeInactive=true')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/users/me/accounts/:id', () => {
    it('200 - returns a single account', async () => {
      const res = await request(ctx.server)
        .get(`/api/users/me/accounts/${accountId}`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: accountId, name: 'Test Account' });
    });

    it('200 - reflects an incoming transfer as a positive currentBalance on the destination account', async () => {
      const transferEmail = 'accounts-transfer-e2e@test.coinflow';
      await cleanupUser(ctx.prisma, transferEmail);
      const transferUser = await registerTestUser(
        ctx.server,
        transferEmail,
        currencyId,
      );
      const transferAuth = {
        Authorization: `Bearer ${transferUser.token}`,
      };

      const allCurrencies = (await request(ctx.server).get('/api/currencies'))
        .body as Array<{ id: number }>;
      const otherCurrencyId = allCurrencies.find(
        (c) => c.id !== currencyId,
      )!.id;

      const usdRes = await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(transferAuth)
        .send({ name: 'E2E Transfer Source', currencyId, startBalance: 0 });
      const uyuRes = await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(transferAuth)
        .send({
          name: 'E2E Transfer Destination',
          currencyId: otherCurrencyId,
          startBalance: 0,
        });
      const usdId = usdRes.body.id as number;
      const uyuId = uyuRes.body.id as number;

      await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(transferAuth)
        .send({
          accountId: usdId,
          destinationAccountId: uyuId,
          type: 'TRANSFER',
          amount: 100,
          exchangeRate: 40,
          effectiveDate: '2026-02-01',
        })
        .expect(201);

      const srcAcc = await request(ctx.server)
        .get(`/api/users/me/accounts/${usdId}`)
        .set(transferAuth);
      const dstAcc = await request(ctx.server)
        .get(`/api/users/me/accounts/${uyuId}`)
        .set(transferAuth);

      expect(srcAcc.body.currentBalance).toBe(-100);
      expect(dstAcc.body.currentBalance).toBe(4000);

      await cleanupUser(ctx.prisma, transferEmail);
    });

    it('404 - account not found', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/accounts/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/users/me/accounts/:id', () => {
    it('200 - updates an account', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/accounts/${accountId}`)
        .set(auth())
        .send({ name: 'Updated Account', startBalance: 100 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Updated Account',
        startBalance: 100,
      });
    });

    it('404 - account not found', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/accounts/999999')
        .set(auth())
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/accounts/:id', () => {
    it('204 - soft deletes an account', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/accounts/${accountId}`)
        .set(auth());

      expect(res.status).toBe(204);
    });

    it('404 - account not found after deletion (no longer in active list)', async () => {
      const res = await request(ctx.server)
        .get(`/api/users/me/accounts/${accountId}`)
        .set(auth());

      expect(res.status).toBe(404);
    });

    it('404 - non-existent account', async () => {
      const res = await request(ctx.server)
        .delete('/api/users/me/accounts/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/me/accounts/summary', () => {
    let secondCurrencyId: number;
    let thirdCurrencyId: number;

    beforeAll(async () => {
      const currenciesRes = await request(ctx.server).get('/api/currencies');
      const currencies = currenciesRes.body as Array<{ id: number }>;
      const others = currencies.filter((c) => c.id !== currencyId);
      secondCurrencyId = others[0].id;
      thirdCurrencyId = others[1].id;

      // 1 base unit = 2 units of secondCurrency -> convertToBase divides by the rate.
      await request(ctx.server)
        .post('/api/users/me/currencies')
        .set(auth())
        .send({ currencyId: secondCurrencyId, base: false, exchangeRate: 2 });

      await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(auth())
        .send({ name: 'Base Account', currencyId, startBalance: 100 });

      await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(auth())
        .send({
          name: 'Foreign Account',
          currencyId: secondCurrencyId,
          startBalance: 100,
        });

      // thirdCurrencyId is never added to the user's currencies, so it has no rate.
      await request(ctx.server)
        .post('/api/users/me/accounts')
        .set(auth())
        .send({
          name: 'Unconvertible Account',
          currencyId: thirdCurrencyId,
          startBalance: 50,
        });
    });

    it('200 - consolidates net worth into the base currency', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/accounts/summary')
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body.totalInBase).toBeCloseTo(150, 6);
      expect(res.body.byCurrency).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ net: 100, netInBase: 100 }),
          expect.objectContaining({ net: 100, netInBase: 50 }),
          expect.objectContaining({ net: 50, netInBase: null }),
        ]),
      );
    });

    it('200 - lists currencies without an exchange rate as unconvertible', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/accounts/summary')
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body.unconvertibleCurrencies).toHaveLength(1);
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get(
        '/api/users/me/accounts/summary',
      );

      expect(res.status).toBe(401);
    });
  });
});
