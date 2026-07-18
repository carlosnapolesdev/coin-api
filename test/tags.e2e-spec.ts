import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Tags (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let currencyId: number;
  let accountId: number;
  let categoryId: number;
  const email = 'tags-e2e@test.crecik';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);
    await cleanupUser(ctx.prisma, email);
    user = await registerTestUser(ctx.server, email, currencyId);

    const auth = { Authorization: `Bearer ${user.token}` };

    const accountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set(auth)
      .send({ name: 'Tags Test Account', currencyId, startBalance: 0 });
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

  describe('Auth gating', () => {
    it('401 - GET without token', async () => {
      const res = await request(ctx.server).get('/api/users/me/tags');
      expect(res.status).toBe(401);
    });

    it('401 - PATCH without token', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/tags/1')
        .send({ name: 'x' });
      expect(res.status).toBe(401);
    });

    it('401 - DELETE without token', async () => {
      const res = await request(ctx.server).delete('/api/users/me/tags/1');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me/tags', () => {
    it('200 - returns an empty list when no tags exist', async () => {
      const res = await request(ctx.server)
        .get('/api/users/me/tags')
        .set(auth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('200 - returns tags with usageCount once transactions exist', async () => {
      await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(auth())
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: 10,
          effectiveDate: '2026-01-10',
          tags: 'food, coffee',
        });
      await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(auth())
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: 5,
          effectiveDate: '2026-01-11',
          tags: 'food',
        });
      await request(ctx.server)
        .post('/api/users/me/transactions')
        .set(auth())
        .send({
          accountId,
          categoryId,
          type: 'EXPENSE',
          amount: 20,
          effectiveDate: '2026-01-12',
          tags: 'travel',
        });

      const res = await request(ctx.server)
        .get('/api/users/me/tags')
        .set(auth());

      expect(res.status).toBe(200);
      const tags = res.body as Array<{
        id: number;
        name: string;
        usageCount: number;
      }>;
      const byName = new Map(tags.map((t) => [t.name, t]));
      expect(byName.get('food')?.usageCount).toBeGreaterThanOrEqual(2);
      expect(byName.get('coffee')?.usageCount).toBeGreaterThanOrEqual(1);
      expect(byName.get('travel')?.usageCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /api/users/me/tags/:id', () => {
    let tagIdToRename: number;

    it('200 - renames a tag and the new name appears in transactions', async () => {
      const list = await request(ctx.server)
        .get('/api/users/me/tags')
        .set(auth());
      const food = (list.body as Array<{ id: number; name: string }>).find(
        (t) => t.name === 'food',
      );
      expect(food).toBeDefined();
      tagIdToRename = food!.id;

      const res = await request(ctx.server)
        .patch(`/api/users/me/tags/${tagIdToRename}`)
        .set(auth())
        .send({ name: 'groceries' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: tagIdToRename, name: 'groceries' });

      const txRes = await request(ctx.server)
        .get('/api/users/me/transactions')
        .set(auth());
      const txTags = (txRes.body as Array<{ tags: string | null }>)
        .map((t) => t.tags)
        .filter((t): t is string => typeof t === 'string' && t.length > 0);
      expect(txTags.some((csv) => csv.includes('groceries'))).toBe(true);
      expect(
        txTags.every((csv) => !csv.includes('food,') && csv !== 'food'),
      ).toBe(true);
    });

    it('200 - renaming is idempotent when newName equals current name', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/tags/${tagIdToRename}`)
        .set(auth())
        .send({ name: 'groceries' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'groceries' });
    });

    it('400 - missing name', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/tags/${tagIdToRename}`)
        .set(auth())
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.validationErrors).toHaveProperty('name');
    });

    it('400 - empty name', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/tags/${tagIdToRename}`)
        .set(auth())
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('400 - name over 100 chars', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/tags/${tagIdToRename}`)
        .set(auth())
        .send({ name: 'a'.repeat(101) });

      expect(res.status).toBe(400);
    });

    it('409 - name collides with an existing tag', async () => {
      const res = await request(ctx.server)
        .patch(`/api/users/me/tags/${tagIdToRename}`)
        .set(auth())
        .send({ name: 'coffee' });

      expect(res.status).toBe(409);
    });

    it('404 - non-existent tag id', async () => {
      const res = await request(ctx.server)
        .patch('/api/users/me/tags/9999999')
        .set(auth())
        .send({ name: 'whatever' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/tags/:id', () => {
    it('204 - removes the tag and transactions no longer carry it', async () => {
      const list = await request(ctx.server)
        .get('/api/users/me/tags')
        .set(auth());
      const travel = (list.body as Array<{ id: number; name: string }>).find(
        (t) => t.name === 'travel',
      );
      expect(travel).toBeDefined();

      const res = await request(ctx.server)
        .delete(`/api/users/me/tags/${travel!.id}`)
        .set(auth());

      expect(res.status).toBe(204);

      const after = await request(ctx.server)
        .get('/api/users/me/tags')
        .set(auth());
      const afterTags = after.body as Array<{ name: string }>;
      expect(afterTags.find((t) => t.name === 'travel')).toBeUndefined();

      const txRes = await request(ctx.server)
        .get('/api/users/me/transactions')
        .set(auth());
      const txTags = (txRes.body as Array<{ tags: string | null }>)
        .map((t) => t.tags)
        .filter((t): t is string => typeof t === 'string' && t.length > 0);
      expect(
        txTags.every(
          (csv) => !csv.split(',').some((t) => t.trim() === 'travel'),
        ),
      ).toBe(true);
    });

    it('404 - non-existent tag id', async () => {
      const res = await request(ctx.server)
        .delete('/api/users/me/tags/9999999')
        .set(auth());

      expect(res.status).toBe(404);
    });
  });
});
