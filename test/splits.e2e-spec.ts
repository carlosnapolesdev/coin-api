import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

interface SplitFixture {
  id: number;
  categoryId: number;
  categoryName: string;
  amount: number;
  memo: string | null;
}

describe('Splits (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let otherUser: TestUser;
  let currencyId: number;
  let accountId: number;
  let categoryId: number;
  let secondCategoryId: number;
  let otherCategoryId: number;
  let expenseTxId: number;
  let transferTxId: number;
  const email = 'splits-e2e@test.coinflow';
  const otherEmail = 'splits-e2e-other@test.coinflow';

  beforeAll(async () => {
    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);

    await cleanupUser(ctx.prisma, email);
    await cleanupUser(ctx.prisma, otherEmail);
    user = await registerTestUser(ctx.server, email, currencyId);
    otherUser = await registerTestUser(ctx.server, otherEmail, currencyId);

    const auth = { Authorization: `Bearer ${user.token}` };
    const otherAuth = { Authorization: `Bearer ${otherUser.token}` };

    const accountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set(auth)
      .send({ name: 'Splits Account', type: 'CHECKING', currencyId });
    accountId = accountRes.body.id as number;

    const destAccountRes = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set(auth)
      .send({ name: 'Destination Account', type: 'CHECKING', currencyId });
    const destAccountId = destAccountRes.body.id as number;

    const catRes = await request(ctx.server)
      .get('/api/users/me/categories')
      .set(auth);
    const cats = catRes.body as Array<{ id: number; type: string }>;
    const expenseCats = cats.filter((c) => c.type === 'EXPENSE');
    if (expenseCats.length < 2) {
      throw new Error('Test fixture needs at least 2 EXPENSE categories');
    }
    categoryId = expenseCats[0].id;
    secondCategoryId = expenseCats[1].id;

    const otherCatRes = await request(ctx.server)
      .get('/api/users/me/categories')
      .set(otherAuth);
    const otherCats = otherCatRes.body as Array<{ id: number; type: string }>;
    otherCategoryId = otherCats.find((c) => c.type === 'EXPENSE')!.id;

    const txRes = await request(ctx.server)
      .post('/api/users/me/transactions')
      .set(auth)
      .send({
        accountId,
        type: 'EXPENSE',
        amount: 100,
        effectiveDate: '2026-07-12',
      });
    expenseTxId = txRes.body.id as number;

    const transferRes = await request(ctx.server)
      .post('/api/users/me/transactions')
      .set(auth)
      .send({
        accountId,
        destinationAccountId: destAccountId,
        type: 'TRANSFER',
        amount: 50,
        effectiveDate: '2026-07-12',
      });
    transferTxId = transferRes.body.id as number;
  });

  afterAll(async () => {
    await ctx.prisma.transactionSplit.deleteMany({
      where: { transaction: { userId: BigInt(user.id) } },
    });
    await cleanupUser(ctx.prisma, email);
    await cleanupUser(ctx.prisma, otherEmail);
    await ctx.app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  it('PUT splits → 200 and the tx is updated with splitCount', async () => {
    const res = await request(ctx.server)
      .put(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth())
      .send({
        splits: [
          { categoryId, amount: 60, memo: 'Food' },
          { categoryId: secondCategoryId, amount: 40 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: expenseTxId,
      splitCount: 2,
      categoryId: null,
    });
  });

  it('GET splits → 200 returns both splits with category names', async () => {
    const res = await request(ctx.server)
      .get(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const splits = res.body as SplitFixture[];
    expect(splits).toHaveLength(2);
    const total = splits.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(100);
    expect(splits[0]).toMatchObject({ categoryId, amount: 60, memo: 'Food' });
    expect(splits[0].categoryName).toBeTruthy();
    expect(splits[1]).toMatchObject({
      categoryId: secondCategoryId,
      amount: 40,
    });
  });

  it('PUT with mismatched sum → 400', async () => {
    const res = await request(ctx.server)
      .put(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth())
      .send({
        splits: [
          { categoryId, amount: 60 },
          { categoryId: secondCategoryId, amount: 30 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/sum to the transaction amount/i);
  });

  it('PUT with a single split → 400', async () => {
    const res = await request(ctx.server)
      .put(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth())
      .send({ splits: [{ categoryId, amount: 100 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least two/i);
  });

  it('PUT on a transfer → 400', async () => {
    const res = await request(ctx.server)
      .put(`/api/users/me/transactions/${transferTxId}/splits`)
      .set(auth())
      .send({
        splits: [
          { categoryId, amount: 30 },
          { categoryId: secondCategoryId, amount: 20 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not supported for transfers/i);
  });

  it("PUT with another user's category → 404", async () => {
    const res = await request(ctx.server)
      .put(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth())
      .send({
        splits: [
          { categoryId, amount: 60 },
          { categoryId: otherCategoryId, amount: 40 },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/category/i);
  });

  it('PATCH the parent tx amount while it has splits → 400', async () => {
    const res = await request(ctx.server)
      .patch(`/api/users/me/transactions/${expenseTxId}`)
      .set(auth())
      .send({ amount: 200 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/remove splits/i);
  });

  it('PATCH the parent tx category while it has splits → 400', async () => {
    const res = await request(ctx.server)
      .patch(`/api/users/me/transactions/${expenseTxId}`)
      .set(auth())
      .send({ categoryId: secondCategoryId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/remove splits/i);
  });

  it('PUT [] → 200 and tx becomes a "simple" tx again with splitCount 0', async () => {
    const res = await request(ctx.server)
      .put(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth())
      .send({ splits: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ splitCount: 0 });

    const list = await request(ctx.server)
      .get(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth());
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  });

  it('Re-PATCH the parent tx category after clearing → 200', async () => {
    const res = await request(ctx.server)
      .patch(`/api/users/me/transactions/${expenseTxId}`)
      .set(auth())
      .send({ categoryId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ categoryId, splitCount: 0 });
  });

  it('DELETE the tx with splits cascades and returns 204', async () => {
    await request(ctx.server)
      .put(`/api/users/me/transactions/${expenseTxId}/splits`)
      .set(auth())
      .send({
        splits: [
          { categoryId, amount: 60 },
          { categoryId: secondCategoryId, amount: 40 },
        ],
      });

    const del = await request(ctx.server)
      .delete(`/api/users/me/transactions/${expenseTxId}`)
      .set(auth());
    expect(del.status).toBe(204);

    const remaining = await ctx.prisma.transactionSplit.count({
      where: { transactionId: BigInt(expenseTxId) },
    });
    expect(remaining).toBe(0);
  });
});
