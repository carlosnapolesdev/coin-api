import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Users (e2e)', () => {
  let ctx: TestContext;
  let currencyId: number;
  let user: TestUser;
  const email = 'users-e2e@test.coinflow';

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

  describe('PATCH /api/users/me', () => {
    it('200 - updates full name and language', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ fullName: 'Updated Name', language: 'es' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ fullName: 'Updated Name', language: 'es' });
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me')
        .send({ fullName: 'Nope' });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/me/password', () => {
    it('401 - wrong current password', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'WrongPass1', newPassword: 'NewPass1' });

      expect(res.status).toBe(401);
    });

    it('200 - changes the password and the new one works on login', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'Test1234', newPassword: 'NewPass1' });

      expect(res.status).toBe(200);

      const loginRes = await request(ctx.server)
        .post('/api/auth/login')
        .send({ identifier: email, password: 'NewPass1' });
      expect(loginRes.status).toBe(200);
    });
  });
});
