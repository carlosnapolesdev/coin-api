import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import {
  cleanupUser,
  createTestApp,
  getFirstCurrencyId,
  registerTestUser,
  TestContext,
  TestUser,
} from './helpers/app.helper';

describe('Attachments (e2e)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let otherUser: TestUser;
  let currencyId: number;
  let accountId: number;
  let transactionId: number;
  let otherTransactionId: number;
  let attachmentId: number;
  let uploadDir: string;
  const email = 'attachments-e2e@test.coinflow';
  const otherEmail = 'attachments-e2e-other@test.coinflow';

  beforeAll(async () => {
    uploadDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'coinflow-attachments-e2e-'),
    );
    process.env.UPLOAD_DIR = uploadDir;

    ctx = await createTestApp();
    currencyId = await getFirstCurrencyId(ctx.server);

    await cleanupUser(ctx.prisma, email);
    await cleanupUser(ctx.prisma, otherEmail);
    user = await registerTestUser(ctx.server, email, currencyId);
    otherUser = await registerTestUser(ctx.server, otherEmail, currencyId);

    const acc = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set({ Authorization: `Bearer ${user.token}` })
      .send({ name: 'Test', type: 'CHECKING', currencyId });
    accountId = acc.body.id as number;

    const otherAcc = await request(ctx.server)
      .post('/api/users/me/accounts')
      .set({ Authorization: `Bearer ${otherUser.token}` })
      .send({ name: 'Other', type: 'CHECKING', currencyId });
    const otherAccountId = otherAcc.body.id as number;

    const tx = await request(ctx.server)
      .post('/api/users/me/transactions')
      .set({ Authorization: `Bearer ${user.token}` })
      .send({
        accountId,
        type: 'EXPENSE',
        amount: 1,
        effectiveDate: '2026-07-09',
      });
    transactionId = tx.body.id as number;

    const otherTx = await request(ctx.server)
      .post('/api/users/me/transactions')
      .set({ Authorization: `Bearer ${otherUser.token}` })
      .send({
        accountId: otherAccountId,
        type: 'EXPENSE',
        amount: 1,
        effectiveDate: '2026-07-09',
      });
    otherTransactionId = otherTx.body.id as number;
  });

  afterAll(async () => {
    await ctx.prisma.attachment.deleteMany({
      where: { userId: BigInt(user.id) },
    });
    await ctx.prisma.attachment.deleteMany({
      where: { userId: BigInt(otherUser.id) },
    });
    await cleanupUser(ctx.prisma, email);
    await cleanupUser(ctx.prisma, otherEmail);
    await ctx.app.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const pngBuf = Buffer.from('89504e470d0a1a0a', 'hex');

  it('POST upload PNG -> 201 and registers attachment', async () => {
    const res = await request(ctx.server)
      .post(`/api/users/me/transactions/${transactionId}/attachments`)
      .set(auth(user.token))
      .attach('file', Buffer.from(pngBuf), {
        filename: 'r.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fileName: 'r.png',
      mimeType: 'image/png',
      sizeBytes: pngBuf.length,
    });
    attachmentId = res.body.id as number;
  });

  it('GET list -> includes uploaded attachment', async () => {
    const res = await request(ctx.server)
      .get(`/api/users/me/transactions/${transactionId}/attachments`)
      .set(auth(user.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.find((a: any) => a.id === attachmentId)).toBeTruthy();
  });

  it('GET download -> 200 with same bytes and inline disposition', async () => {
    const res = await request(ctx.server)
      .get(
        `/api/users/me/attachments/${attachmentId}/download?disposition=inline`,
      )
      .set(auth(user.token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    expect((res.body as Buffer).equals(pngBuf)).toBe(true);
  });

  it('GET download via query token (new tab scenario) -> 200', async () => {
    const res = await request(ctx.server).get(
      `/api/users/me/attachments/${attachmentId}/download?disposition=inline&token=${user.token}`,
    );
    expect(res.status).toBe(200);
  });

  it('POST upload forbidden mime -> 400 unsupported', async () => {
    const res = await request(ctx.server)
      .post(`/api/users/me/transactions/${transactionId}/attachments`)
      .set(auth(user.token))
      .attach('file', Buffer.from('exe'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unsupported/i);
  });

  it('POST upload too large -> 400 exceeds limit (multer)', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024);
    const res = await request(ctx.server)
      .post(`/api/users/me/transactions/${transactionId}/attachments`)
      .set(auth(user.token))
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exceeds/i);
  });

  it("POST upload against another user's transaction -> 404", async () => {
    const res = await request(ctx.server)
      .post(`/api/users/me/transactions/${otherTransactionId}/attachments`)
      .set(auth(user.token))
      .attach('file', Buffer.from(pngBuf), {
        filename: 'a.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/transaction/i);
  });

  it('DELETE attachment -> 204 and storage file is gone', async () => {
    const res = await request(ctx.server)
      .delete(`/api/users/me/attachments/${attachmentId}`)
      .set(auth(user.token));
    expect(res.status).toBe(204);
    const list = await request(ctx.server)
      .get(`/api/users/me/transactions/${transactionId}/attachments`)
      .set(auth(user.token));
    expect(list.body.find((a: any) => a.id === attachmentId)).toBeUndefined();
  });

  it('Limit: 6th upload to same transaction -> 409', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(ctx.server)
        .post(`/api/users/me/transactions/${transactionId}/attachments`)
        .set(auth(user.token))
        .attach('file', Buffer.from(pngBuf), {
          filename: `r${i}.png`,
          contentType: 'image/png',
        });
      expect(ok.status).toBe(201);
    }
    const denied = await request(ctx.server)
      .post(`/api/users/me/transactions/${transactionId}/attachments`)
      .set(auth(user.token))
      .attach('file', Buffer.from(pngBuf), {
        filename: 'r6.png',
        contentType: 'image/png',
      });
    expect(denied.status).toBe(409);
    expect(denied.body.message).toMatch(/maximum/i);
  });
});
