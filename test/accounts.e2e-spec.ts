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
});
