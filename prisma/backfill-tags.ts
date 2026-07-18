import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

loadEnv();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface TxRow {
  id: bigint;
  userId: bigint;
  tags: string | null;
}

async function backfillTags(): Promise<void> {
  const transactions = await prisma.transaction.findMany({
    select: { id: true, userId: true, tags: true },
  });

  const dedupe = new Map<string, { userId: bigint; name: string }>();
  for (const tx of transactions as TxRow[]) {
    if (!tx.tags) continue;
    const names = tx.tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    for (const name of names) {
      if (name.length > 100) continue;
      const key = `${tx.userId}|${name.toLowerCase()}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, { userId: tx.userId, name });
      }
    }
  }

  const rows = Array.from(dedupe.values());
  if (rows.length === 0) {
    console.log(
      '[backfill-tags] No tag strings found in transactions; nothing to insert.',
    );
    return;
  }

  const result = await prisma.tag.createMany({
    data: rows,
    skipDuplicates: true,
  });

  console.log(
    `[backfill-tags] Scanned ${transactions.length} transactions, attempted ${rows.length} unique (user, tag) pairs, inserted ${result.count} new Tag rows.`,
  );

  const byUser = new Map<string, number>();
  for (const row of rows) {
    const k = row.userId.toString();
    byUser.set(k, (byUser.get(k) ?? 0) + 1);
  }
  for (const [userId, count] of byUser.entries()) {
    console.log(`  user ${userId}: ${count} candidate tag(s)`);
  }
}

backfillTags()
  .catch((err) => {
    console.error('[backfill-tags] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
