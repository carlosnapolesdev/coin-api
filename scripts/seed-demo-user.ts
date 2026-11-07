/**
 * Creates a demo user with enough data to exercise every feature of the app:
 * accounts in two currencies, six months of transactions (including a transfer,
 * a cross-currency transfer, a split, a pending and a voided one), budgets,
 * goals, recurring rules, a reconciliation and notifications.
 *
 *   npm run seed:demo
 *
 * Writes to whatever DATABASE_URL points at, so it refuses to run against
 * NODE_ENV=production or against any database that is not on this machine
 * (see assertLocalDatabase). Re-running wipes the demo user's data and
 * rebuilds it: the dataset is deterministic (no random amounts) so screenshots
 * and manual test runs stay comparable.
 *
 * Data goes in through the app's own services, not raw inserts, so invariants
 * that live in the services -- transfer pairs sharing a transferGroupId, tags
 * being registered, reconciliation arithmetic -- hold exactly as they do in
 * production.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CategoriesService } from '../src/categories/categories.service';
import { CurrenciesService } from '../src/currencies/currencies.service';
import { AccountsService } from '../src/accounts/accounts.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { SplitsService } from '../src/transactions/splits.service';
import { BudgetsService } from '../src/budgets/budgets.service';
import { GoalsService } from '../src/goals/goals.service';
import { RecurringService } from '../src/recurring/recurring.service';
import { ReconciliationsService } from '../src/reconciliations/reconciliations.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import {
  AccountType,
  RecurrenceFrequency,
  TransactionStatus,
  TransactionType,
} from '../src/common/enums';
import * as bcrypt from 'bcrypt';

const EMAIL = 'demo@crecik.local';
const PASSWORD = 'Demo1234!';
const FULL_NAME = 'Camila Duarte';
const LANGUAGE = 'es';

const USD = 143;
const EUR = 44;

// Catalog categories the seed spends against, by their English catalog name.
// User categories are copies, so they are resolved through sourceCategoryId
// instead of by name -- the copies are translated to the user's language.
const CATEGORY_NAMES = [
  'Wage & Salary',
  'Bonus',
  'Interest',
  'Rent',
  'Groceries',
  'Dining Out',
  'Gasoline',
  'Electricity',
  'On-line/Internet Service',
  'Cell Phone',
  'Entertainment',
  'Health-care',
  'Clothing',
  'Household',
  'Bank Charges',
] as const;

type CategoryName = (typeof CATEGORY_NAMES)[number];

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const dayOf = (monthsAgo: number, day: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, day);
};

// The demo password is committed in this file, so the account must never land
// in a database other people can sign in to. NODE_ENV alone does not ensure
// that: a laptop whose DATABASE_URL points at production still says
// "development". Loopback hosts and Unix sockets are local by construction, so
// they are the only targets accepted; anything else, including an empty host
// that would fall back to PGHOST, is refused.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function assertLocalDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error('Refusing to seed demo data: DATABASE_URL is not set.');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Not chained as `cause` on purpose: Node's ERR_INVALID_URL carries the
    // raw input, password included, and main() prints the whole error chain.
    throw new Error(
      'Refusing to seed demo data: DATABASE_URL is not a valid URL.',
    );
  }

  // pg lets `?host=` override the authority, and a host starting with "/" is
  // the directory of a Unix socket.
  const host = (url.searchParams.get('host') ?? url.hostname).toLowerCase();
  if (!host.startsWith('/') && !LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed demo data into the database at "${host || '(no host)'}": ` +
        'the demo password is public, so only localhost or a Unix socket is accepted.',
    );
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed demo data with NODE_ENV=production. Point DATABASE_URL at a local database.',
    );
  }
  // ConfigModule.forRoot() loads .env while AppModule is being imported, so
  // DATABASE_URL is already in process.env here, before anything connects.
  assertLocalDatabase(process.env.DATABASE_URL);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const currencies = app.get(CurrenciesService);
    const categories = app.get(CategoriesService);
    const accountsService = app.get(AccountsService);
    const transactions = app.get(TransactionsService);
    const splits = app.get(SplitsService);
    const budgets = app.get(BudgetsService);
    const goals = app.get(GoalsService);
    const recurring = app.get(RecurringService);
    const reconciliations = app.get(ReconciliationsService);
    const notifications = app.get(NotificationsService);

    // ── Reset ────────────────────────────────────────────────────────────────
    // Most relations are ON DELETE NO ACTION, so the order below is the
    // dependency order, not a preference. User categories are self-referencing
    // (parentId), hence children before parents.
    const existing = await prisma.user.findFirst({
      where: { email: EMAIL },
      select: { id: true },
    });
    if (existing) {
      const userId = existing.id;
      await prisma.attachment.deleteMany({ where: { userId } });
      await prisma.transactionSplit.deleteMany({
        where: { transaction: { userId } },
      });
      await prisma.transaction.deleteMany({ where: { userId } });
      await prisma.reconciliation.deleteMany({ where: { userId } });
      await prisma.budget.deleteMany({ where: { userId } });
      await prisma.goal.deleteMany({ where: { userId } });
      await prisma.recurringTransaction.deleteMany({ where: { userId } });
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.tag.deleteMany({ where: { userId } });
      await prisma.account.deleteMany({ where: { userId } });
      await prisma.userCategory.deleteMany({
        where: { userId, NOT: { parentId: null } },
      });
      await prisma.userCategory.deleteMany({ where: { userId } });
      await prisma.userCurrency.deleteMany({ where: { userId } });
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
      console.log('Usuario demo anterior eliminado.');
    }

    // ── User ─────────────────────────────────────────────────────────────────
    // Built here rather than through AuthService.register because registering
    // sends a verification email through Resend, and this user is verified from
    // the start: the point is to log in immediately.
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        fullName: FULL_NAME,
        email: EMAIL,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        language: LANGUAGE,
        isActive: true,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    const userId = Number(user.id);

    await prisma.$transaction(async (tx) => {
      await currencies.assignCurrenciesToUser(
        user.id,
        [
          { currencyId: USD, base: true, exchangeRate: 1 },
          { currencyId: EUR, base: false, exchangeRate: 0.92 },
        ],
        tx,
      );
      await categories.assignDefaultCategoriesToUser(
        user.id,
        LANGUAGE,
        undefined,
        tx,
      );
    });

    // ── Category lookup ──────────────────────────────────────────────────────
    // Several catalog names are duplicated across groups; the lowest id wins so
    // the mapping is stable between runs.
    const catalog = await prisma.category.findMany({
      where: { name: { in: [...CATEGORY_NAMES] } },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const catalogIdByName = new Map<string, bigint>();
    for (const row of catalog) {
      if (!catalogIdByName.has(row.name)) catalogIdByName.set(row.name, row.id);
    }

    const userCategories = await prisma.userCategory.findMany({
      where: { userId: user.id },
      select: { id: true, sourceCategoryId: true },
    });
    const userCategoryBySource = new Map<string, number>();
    for (const row of userCategories) {
      if (row.sourceCategoryId !== null) {
        userCategoryBySource.set(
          row.sourceCategoryId.toString(),
          Number(row.id),
        );
      }
    }

    const cat = (name: CategoryName): number => {
      const catalogId = catalogIdByName.get(name);
      const id = catalogId && userCategoryBySource.get(catalogId.toString());
      if (!id)
        throw new Error(`Category "${name}" is missing from the catalog`);
      return id;
    };

    // ── Accounts ─────────────────────────────────────────────────────────────
    const checking = await accountsService.createAccount(userId, {
      name: 'Cuenta corriente',
      institution: 'Banco Galicia',
      type: AccountType.CHECKING,
      currencyId: USD,
      startBalance: 1200,
      icon: 'account_balance',
      accountNumber: '****4417',
    });
    const savings = await accountsService.createAccount(userId, {
      name: 'Ahorros',
      institution: 'Banco Galicia',
      type: AccountType.SAVINGS,
      currencyId: USD,
      startBalance: 8000,
      icon: 'savings',
    });
    const card = await accountsService.createAccount(userId, {
      name: 'Tarjeta de crédito',
      institution: 'Visa',
      type: AccountType.CREDIT_CARD,
      currencyId: USD,
      startBalance: 0,
      icon: 'credit_card',
    });
    const cash = await accountsService.createAccount(userId, {
      name: 'Efectivo',
      type: AccountType.CASH,
      currencyId: USD,
      startBalance: 900,
      icon: 'payments',
    });
    const euros = await accountsService.createAccount(userId, {
      name: 'Cuenta en euros',
      institution: 'N26',
      type: AccountType.BANK,
      currencyId: EUR,
      startBalance: 500,
      icon: 'account_balance',
    });

    // ── Six months of movements ──────────────────────────────────────────────
    // Amounts are fixed per month index so a re-run reproduces the same charts.
    const today = new Date();
    const inThePast = (date: Date): boolean => date <= today;
    let created = 0;

    const add = async (input: {
      accountId: number;
      categoryId?: number;
      type: TransactionType;
      amount: number;
      date: Date;
      payee?: string;
      memo?: string;
      status?: TransactionStatus;
      tags?: string;
      paymentMethod?: string;
    }): Promise<{ id: number }> => {
      const tx = await transactions.createTransaction(userId, {
        accountId: input.accountId,
        categoryId: input.categoryId,
        type: input.type,
        amount: input.amount,
        effectiveDate: iso(input.date),
        payee: input.payee,
        memo: input.memo,
        status: input.status ?? TransactionStatus.CLEARED,
        tags: input.tags,
        paymentMethod: input.paymentMethod,
      });
      created += 1;
      return { id: tx.id };
    };

    const electricity = [78, 64, 91, 70, 88, 59];
    const groceries = [82, 64, 128, 71];
    const dining = [45, 78, 95];
    const fuel = [58, 44];

    for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
      const i = 5 - monthsAgo;

      const salary = dayOf(monthsAgo, 1);
      if (inThePast(salary)) {
        await add({
          accountId: checking.id,
          categoryId: cat('Wage & Salary'),
          type: TransactionType.INCOME,
          amount: 3200,
          date: salary,
          payee: 'Acme S.A.',
          memo: 'Sueldo mensual',
          tags: 'trabajo',
          paymentMethod: 'Transferencia',
        });
      }

      const rent = dayOf(monthsAgo, 3);
      if (inThePast(rent)) {
        await add({
          accountId: checking.id,
          categoryId: cat('Rent'),
          type: TransactionType.EXPENSE,
          amount: 950,
          date: rent,
          payee: 'Inmobiliaria Rivas',
          tags: 'hogar',
          paymentMethod: 'Transferencia',
        });
      }

      const power = dayOf(monthsAgo, 8);
      if (inThePast(power)) {
        await add({
          accountId: checking.id,
          categoryId: cat('Electricity'),
          type: TransactionType.EXPENSE,
          amount: electricity[i],
          date: power,
          payee: 'Edenor',
          tags: 'hogar,servicios',
        });
        await add({
          accountId: checking.id,
          categoryId: cat('On-line/Internet Service'),
          type: TransactionType.EXPENSE,
          amount: 45,
          date: power,
          payee: 'Fibertel',
          tags: 'hogar,servicios',
        });
        await add({
          accountId: card.id,
          categoryId: cat('Cell Phone'),
          type: TransactionType.EXPENSE,
          amount: 30,
          date: power,
          payee: 'Movistar',
          tags: 'servicios',
        });
      }

      for (const [n, day] of [4, 11, 18, 25].entries()) {
        const date = dayOf(monthsAgo, day);
        if (!inThePast(date)) continue;
        await add({
          accountId: n % 2 === 0 ? checking.id : card.id,
          categoryId: cat('Groceries'),
          type: TransactionType.EXPENSE,
          amount: groceries[n],
          date,
          payee: n % 2 === 0 ? 'Supermercado Coto' : 'Carrefour',
          tags: 'hogar',
        });
      }

      // Dining lands on days 2, 6 and 8 so the current month always has its
      // three, which is what pushes that budget over its limit.
      for (const [n, day] of [2, 6, 8].entries()) {
        const date = dayOf(monthsAgo, day);
        if (!inThePast(date)) continue;
        await add({
          accountId: card.id,
          categoryId: cat('Dining Out'),
          type: TransactionType.EXPENSE,
          amount: dining[n],
          date,
          payee: ['La Parolaccia', 'Sushi Club', 'Don Julio'][n],
          tags: 'ocio',
        });
      }

      for (const [n, day] of [9, 23].entries()) {
        const date = dayOf(monthsAgo, day);
        if (!inThePast(date)) continue;
        await add({
          accountId: cash.id,
          categoryId: cat('Gasoline'),
          type: TransactionType.EXPENSE,
          amount: fuel[n],
          date,
          payee: 'YPF',
          tags: 'auto',
        });
      }

      const fun = dayOf(monthsAgo, 16);
      if (inThePast(fun)) {
        await add({
          accountId: card.id,
          categoryId: cat('Entertainment'),
          type: TransactionType.EXPENSE,
          amount: 15.99,
          date: fun,
          payee: 'Netflix',
          tags: 'ocio,suscripciones',
        });
      }

      if (monthsAgo % 2 === 1) {
        const health = dayOf(monthsAgo, 12);
        if (inThePast(health)) {
          await add({
            accountId: checking.id,
            categoryId: cat('Health-care'),
            type: TransactionType.EXPENSE,
            amount: 120,
            date: health,
            payee: 'Odontología Belgrano',
            tags: 'salud',
          });
        }
      }

      if (monthsAgo === 3 || monthsAgo === 0) {
        const clothes = dayOf(monthsAgo, 7);
        if (inThePast(clothes)) {
          await add({
            accountId: card.id,
            categoryId: cat('Clothing'),
            type: TransactionType.EXPENSE,
            amount: 143.5,
            date: clothes,
            payee: 'Zara',
            tags: 'ropa',
          });
        }
      }

      // Paying the card every month keeps its balance believable and gives the
      // transfer list something recurring to show.
      const cardPayment = dayOf(monthsAgo, 20);
      if (inThePast(cardPayment)) {
        await transactions.createTransaction(userId, {
          accountId: checking.id,
          destinationAccountId: card.id,
          type: TransactionType.TRANSFER,
          amount: 420,
          effectiveDate: iso(cardPayment),
          memo: 'Pago de tarjeta',
        });
        created += 2;
      }

      const interest = dayOf(monthsAgo, 28);
      if (inThePast(interest)) {
        await add({
          accountId: savings.id,
          categoryId: cat('Interest'),
          type: TransactionType.INCOME,
          amount: 24.4,
          date: interest,
          payee: 'Banco Galicia',
          memo: 'Intereses de la caja de ahorro',
        });
      }
    }

    // Yearly bonus, so the reports show an outlier month.
    await add({
      accountId: checking.id,
      categoryId: cat('Bonus'),
      type: TransactionType.INCOME,
      amount: 1800,
      date: dayOf(4, 20),
      payee: 'Acme S.A.',
      memo: 'Bono semestral',
      tags: 'trabajo',
    });

    // ── Edge cases worth having on screen ────────────────────────────────────
    const pending = await add({
      accountId: checking.id,
      categoryId: cat('Household'),
      type: TransactionType.EXPENSE,
      amount: 260,
      date: dayOf(0, Math.min(today.getDate(), 9)),
      payee: 'Sodimac',
      memo: 'Pedido de pintura: todavía no impactó en el banco',
      status: TransactionStatus.PENDING,
      tags: 'hogar',
    });

    await add({
      accountId: card.id,
      categoryId: cat('Bank Charges'),
      type: TransactionType.EXPENSE,
      amount: 35,
      date: dayOf(1, 15),
      payee: 'Visa',
      memo: 'Cargo duplicado, anulado por el banco',
      status: TransactionStatus.VOID,
    });

    // A split: one supermarket receipt covering two categories.
    const split = await add({
      accountId: checking.id,
      categoryId: cat('Groceries'),
      type: TransactionType.EXPENSE,
      amount: 210,
      date: dayOf(1, 20),
      payee: 'Jumbo',
      memo: 'Compra grande del mes',
      tags: 'hogar',
    });
    await splits.setSplits(userId, split.id, {
      splits: [
        { amount: 150, categoryId: cat('Groceries'), memo: 'Comida' },
        { amount: 60, categoryId: cat('Household'), memo: 'Limpieza' },
      ],
    });

    // Same-currency transfer, and a cross-currency one that exercises the
    // exchange-rate path.
    await transactions.createTransaction(userId, {
      accountId: checking.id,
      destinationAccountId: savings.id,
      type: TransactionType.TRANSFER,
      amount: 500,
      effectiveDate: iso(dayOf(1, 5)),
      memo: 'Ahorro del mes',
    });
    created += 2;

    await transactions.createTransaction(userId, {
      accountId: checking.id,
      destinationAccountId: euros.id,
      type: TransactionType.TRANSFER,
      amount: 400,
      exchangeRate: 0.92,
      effectiveDate: iso(dayOf(0, Math.min(today.getDate(), 6))),
      memo: 'Cambio a euros para el viaje',
    });
    created += 2;

    // ── Budgets ──────────────────────────────────────────────────────────────
    const firstOfMonth = iso(dayOf(0, 1));
    await budgets.createBudget(userId, {
      categoryId: cat('Groceries'),
      amount: 500,
      startDate: firstOfMonth,
    });
    // Deliberately below the ~218 spent each month: this is the over-budget
    // state, with its notification below.
    await budgets.createBudget(userId, {
      categoryId: cat('Dining Out'),
      amount: 200,
      startDate: firstOfMonth,
    });
    await budgets.createBudget(userId, {
      categoryId: cat('Gasoline'),
      amount: 150,
      startDate: firstOfMonth,
    });
    await budgets.createBudget(userId, {
      categoryId: cat('Entertainment'),
      amount: 60,
      startDate: firstOfMonth,
    });

    // ── Goals ────────────────────────────────────────────────────────────────
    // Linked to an account, so its progress tracks that balance and setting
    // currentAmount here would be ignored.
    await goals.createGoal(userId, {
      name: 'Fondo de emergencia',
      targetAmount: 10000,
      targetDate: iso(new Date(today.getFullYear() + 1, 2, 31)),
      accountId: savings.id,
    });

    const trip = await goals.createGoal(userId, {
      name: 'Viaje a Japón',
      targetAmount: 5000,
      targetDate: iso(new Date(today.getFullYear(), today.getMonth() + 2, 15)),
    });
    await goals.updateGoal(userId, trip.id, { currentAmount: 5000 });

    const laptop = await goals.createGoal(userId, {
      name: 'Notebook nueva',
      targetAmount: 1800,
    });
    await goals.updateGoal(userId, laptop.id, { currentAmount: 320 });

    // ── Recurring rules ──────────────────────────────────────────────────────
    const nextMonth = (day: number): string =>
      iso(new Date(today.getFullYear(), today.getMonth() + 1, day));

    await recurring.createRecurring(userId, {
      accountId: checking.id,
      categoryId: cat('Wage & Salary'),
      type: TransactionType.INCOME,
      amount: 3200,
      frequency: RecurrenceFrequency.MONTHLY,
      startDate: nextMonth(1),
      payee: 'Acme S.A.',
      memo: 'Sueldo',
    });
    await recurring.createRecurring(userId, {
      accountId: checking.id,
      categoryId: cat('Rent'),
      type: TransactionType.EXPENSE,
      amount: 950,
      frequency: RecurrenceFrequency.MONTHLY,
      startDate: nextMonth(3),
      payee: 'Inmobiliaria Rivas',
    });
    await recurring.createRecurring(userId, {
      accountId: card.id,
      categoryId: cat('Entertainment'),
      type: TransactionType.EXPENSE,
      amount: 15.99,
      frequency: RecurrenceFrequency.MONTHLY,
      startDate: nextMonth(16),
      payee: 'Netflix',
      tags: 'suscripciones',
    });
    await recurring.createRecurring(userId, {
      accountId: checking.id,
      destinationAccountId: savings.id,
      type: TransactionType.TRANSFER,
      amount: 500,
      frequency: RecurrenceFrequency.MONTHLY,
      startDate: nextMonth(5),
      memo: 'Ahorro automático',
    });

    // ── Reconciliation ───────────────────────────────────────────────────────
    // The cleared balance is computed by the service, so the only way to open a
    // balanced statement is to ask it first and reopen with that figure. The
    // probe row is thrown away.
    const probe = await reconciliations.open(userId, checking.id, {
      statementDate: iso(dayOf(1, 28)),
      statementBalance: 0,
    });
    await prisma.reconciliation.delete({ where: { id: BigInt(probe.id) } });

    const balanced = await reconciliations.open(userId, checking.id, {
      statementDate: iso(dayOf(1, 28)),
      statementBalance: probe.clearedBalance,
    });
    await reconciliations.complete(userId, balanced.id);

    // A second one left open on purpose: the in-progress state needs testing too.
    await reconciliations.open(userId, cash.id, {
      statementDate: iso(dayOf(0, Math.min(today.getDate(), 5))),
      statementBalance: 150,
    });

    // ── Notifications ────────────────────────────────────────────────────────
    await notifications.pushOnce(userId, {
      type: 'BUDGET_EXCEEDED',
      title: 'Presupuesto de Restaurantes superado',
      body: 'Llevás gastados 218,00 de los 200,00 presupuestados este mes.',
      dedupeKey: `demo-budget-${firstOfMonth}`,
    });
    await notifications.pushOnce(userId, {
      type: 'UPCOMING_PAYMENT',
      title: 'Alquiler el día 3',
      body: 'La transacción recurrente de 950,00 se registrará en Cuenta corriente.',
      dedupeKey: `demo-upcoming-${firstOfMonth}`,
    });
    const readOne = await notifications.pushOnce(userId, {
      type: 'LOW_BALANCE',
      title: 'Saldo bajo en Efectivo',
      body: 'Quedan 150,00 en la cuenta Efectivo.',
      dedupeKey: `demo-low-${firstOfMonth}`,
    });
    await notifications.markRead(userId, readOne.id);

    const accountList = await accountsService.getUserAccounts(userId, false);

    console.log('\n✓ Usuario demo listo\n');
    console.log(`  Correo:      ${EMAIL}`);
    console.log(`  Contraseña:  ${PASSWORD}`);
    console.log(
      `  Idioma:      ${LANGUAGE} · moneda base USD (EUR secundaria)\n`,
    );
    console.log(`  Cuentas:       ${accountList.length}`);
    for (const account of accountList) {
      console.log(
        `    · ${account.name.padEnd(20)} ${account.currencyCode ?? '---'} ${account.currentBalance}`,
      );
    }
    console.log(
      `  Transacciones: ${created} (1 pendiente, 1 anulada, 1 con splits)`,
    );
    console.log('  Presupuestos:  4 (el de Restaurantes queda excedido)');
    console.log('  Metas:         3 (una cumplida)');
    console.log('  Recurrentes:   4');
    console.log('  Conciliaciones: 1 completada, 1 abierta');
    console.log('  Notificaciones: 3 (una leída)');
    console.log(
      `\n  Pendiente de prueba manual: adjuntos (necesitan subir un fichero real).\n  Transacción pendiente para conciliar: #${pending.id}\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
