import * as crypto from 'node:crypto';
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
  const email = 'auth-e2e@test.crecik';

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
        .send({ email: 'incomplete@test.crecik' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('validationErrors');
    });

    it('400 - weak password (no number)', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/register')
        .send({
          fullName: 'Test',
          email: 'weak@test.crecik',
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
        .send({ identifier: 'nobody@test.crecik', password: 'Test1234' });

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

  describe('POST /api/auth/forgot-password + POST /api/auth/reset-password', () => {
    it('200 - always returns OK, even for an unknown email (no enumeration)', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@test.crecik' });

      expect(res.status).toBe(200);
    });

    it('resets the password with the token issued for a known email, then logs in with it', async () => {
      const forgotRes = await request(ctx.server)
        .post('/api/auth/forgot-password')
        .send({ email });
      expect(forgotRes.status).toBe(200);

      const user = await ctx.prisma.user.findFirstOrThrow({
        where: { email },
      });
      const tokenRow = await ctx.prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: user.id, usedAt: null },
        orderBy: { id: 'desc' },
      });

      // The raw token is only known to the mail transport (logged, not persisted);
      // for this e2e we mint one with a matching hash so we can drive the endpoint.
      const rawToken = 'e2e-raw-token';
      await ctx.prisma.passwordResetToken.update({
        where: { id: tokenRow.id },
        data: {
          tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        },
      });

      const resetRes = await request(ctx.server)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'NewPass1' });
      expect(resetRes.status).toBe(200);

      const loginRes = await request(ctx.server)
        .post('/api/auth/login')
        .send({ identifier: email, password: 'NewPass1' });
      expect(loginRes.status).toBe(200);

      // token cannot be reused
      const reuseRes = await request(ctx.server)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'AnotherPass1' });
      expect(reuseRes.status).toBe(400);
    });

    it('400 - unknown token', async () => {
      const res = await request(ctx.server)
        .post('/api/auth/reset-password')
        .send({ token: 'not-a-real-token', newPassword: 'NewPass1' });
      expect(res.status).toBe(400);
    });
  });
});
