import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  TestContext,
} from './helpers/app.helper';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  let currencyId: number;
  const email = 'auth-e2e@test.coinflow';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
  });

  afterAll(async () => {
    await cleanupUser(ctx.prisma, email);
    await ctx.app.close();
  });

  describe('POST /api/auth/register', () => {
    it('201 - registers a new user', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/register')
        .send({
          fullName: 'Auth Test User',
          email,
          password: 'Test1234',
          currencies: [{ currencyId, base: true }],
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        email,
        fullName: 'Auth Test User',
        language: 'en',
      });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('409 - duplicate email', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/register')
        .send({
          fullName: 'Duplicate',
          email,
          password: 'Test1234',
          currencies: [{ currencyId, base: true }],
        });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ status: 409, error: 'Conflict' });
    });

    it('400 - missing required fields', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/register')
        .send({ email: 'incomplete@test.coinflow' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('validationErrors');
    });

    it('400 - weak password (no number)', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/register')
        .send({
          fullName: 'Test',
          email: 'weak@test.coinflow',
          password: 'onlyletters',
          currencies: [{ currencyId, base: true }],
        });

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toHaveProperty('password');
    });
  });

  describe('POST /api/auth/login', () => {
    it('200 - login with email', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/login')
        .send({ identifier: email, password: 'Test1234' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        token: expect.any(String),
        tokenType: 'Bearer',
        user: { email },
      });
    });

    it('401 - wrong password', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/login')
        .send({ identifier: email, password: 'WrongPass99' });

      expect(res.status).toBe(401);
    });

    it('401 - non-existent user', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/login')
        .send({ identifier: 'nobody@test.coinflow', password: 'Test1234' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    let token: string;

    beforeAll(async () => {
      const res = await request(ctx.server)
        .post('/api/auth/login')
        .send({ identifier: email, password: 'Test1234' });
      token = res.body.token as string;
    });

    it('200 - returns user profile', async () => {
      const res = await request(ctx.server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email, fullName: 'Auth Test User' });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('401 - invalid token', async () => {
      const res = await request(ctx.server)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
    });
  });
});
