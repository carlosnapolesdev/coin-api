import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Categories (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let createdCategoryId: number;
  const email = 'categories-e2e@test.coinflow';

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

  describe('GET /api/categories', () => {
    it('200 - public endpoint returns category tree', async () => {
      const res = await request(ctx.server).get('/api/categories');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        type: expect.any(String),
      });
    });

    it('200 - with language param', async () => {
      const res = await request(ctx.server).get('/api/categories?language=es');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('400 - invalid type filter', async () => {
      const res = await request(ctx.server).get('/api/categories?type=INVALID');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/users/me/categories', () => {
    it('200 - returns user category tree', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/categories')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('401 - no token', async () => {
      const res = await request(ctx.server).get('/api/users/me/categories');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/users/me/categories', () => {
    it('201 - creates a custom category', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/categories')
        .set(auth())
        .send({ name: 'My Category', type: 'EXPENSE' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: 'My Category',
        type: 'EXPENSE',
        active: true,
      });
      createdCategoryId = res.body.id as number;
    });

    it('400 - missing name', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/categories')
        .set(auth())
        .send({ type: 'EXPENSE' });

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toHaveProperty('name');
    });

    it('400 - invalid type', async () => {
      const res = await request(ctx.server)
        .post('/api/users/me/categories')
        .set(auth())
        .send({ name: 'Test', type: 'INVALID' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/users/me/categories/:id', () => {
    it('200 - updates a category', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/categories/${createdCategoryId}`)
        .set(auth())
        .send({ name: 'Updated Category' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Updated Category' });
    });

    it('200 - deactivates a category', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/categories/${createdCategoryId}`)
        .set(auth())
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ active: false });
    });

    it('404 - category not found', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/categories/999999')
        .set(auth())
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/categories/:id', () => {
    it('204 - soft deletes a category', async () => {
      const res = await request(ctx.server)
        .delete(`/api/users/me/categories/${createdCategoryId}`)
        .set(auth());

      expect(res.status).toBe(204);
    });

    it('404 - non-existent category', async () => {
      const res = await request(ctx.server)
        .delete('/api/users/me/categories/999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });
});
