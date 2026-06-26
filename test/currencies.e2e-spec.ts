import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Currencies (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  const email = 'currencies-e2e@test.coinflow';

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

  describe('GET /api/currencies', () => {
    it('200 - public endpoint returns currency catalog', async () => {
      const res = await request(ctx.server).get('/api/currencies');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toMatchObject({
        id: expect.any(Number),
        code: expect.any(String),
        symbol: expect.any(String),
      });
    });
  });

  describe('GET /api/users/me/currencies', () => {
    it('200 - returns user currencies', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/currencies')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toMatchObject({ isBase: true });
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get('/api/users/me/currencies');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/users/me/currencies', () => {
    let secondCurrencyId: number;

    beforeAll(async () => {
      const res = await request(ctx.server).get('/api/currencies');
      const all = res.body as Array<{ id: number }>;
      const second = all.find((c) => c.id !== currencyId);
      if (!second) throw new Error('Need at least 2 currencies in DB');
      secondCurrencyId = second.id;
    });

    it('201 - adds a new currency', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/currencies')
        .set(auth())
        .send({ currencyId: secondCurrencyId, base: false });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        currencyId: secondCurrencyId,
        isBase: false,
        isActive: true,
      });
    });

    it('409 - duplicate currency', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/currencies')
        .set(auth())
        .send({ currencyId: secondCurrencyId, base: false });

      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /api/users/me/currencies/:id', () => {
    it('200 - updates a user currency', async () => {
      const listRes = await request(ctx.server)
        .get('/api/users/me/currencies?includeInactive=true')
        .set(auth());
      const nonBase = (
        listRes.body as Array<{ currencyId: number; isBase: boolean }>
      ).find((c) => !c.isBase);
      if (!nonBase) return;

      const res = await request(ctx.server)
        .patch(`/api/users/me/currencies/${nonBase.currencyId}`)
        .set(auth())
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ isActive: false });
    });

    it('404 - currency not in user set', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/currencies/999999')
        .set(auth())
        .send({ active: false });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/currencies/:id', () => {
    it('400 - cannot delete base currency', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/currencies/${currencyId}`)
        .set(auth());

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/users/me/currencies', () => {
    it('200 - replaces the currency set', async () => {
      const res = await request(ctx.server)
        .put('/api/users/me/currencies')
        .set(auth())
        .send({ currencies: [{ currencyId, base: true }] });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
