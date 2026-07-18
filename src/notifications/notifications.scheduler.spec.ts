import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { AccountsService } from '../accounts/accounts.service';
import { NotificationsService } from './notifications.service';
import { NotificationsScheduler } from './notifications.scheduler';

const makeUser = (id: bigint) => ({
  id,
  username: `u${id}`,
  email: null,
});

describe('NotificationsScheduler', () => {
  let scheduler: NotificationsScheduler;

  const mockPrisma = {
    user: { findMany: jest.fn() },
    recurringTransaction: { findMany: jest.fn() },
  };

  const mockNotifications = {
    pushOnce: jest.fn(),
    list: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    countUnread: jest.fn(),
  };

  const mockBudgets = { listBudgets: jest.fn() };
  const mockAccounts = { getUserAccounts: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: BudgetsService, useValue: mockBudgets },
        { provide: AccountsService, useValue: mockAccounts },
      ],
    }).compile();

    scheduler = module.get<NotificationsScheduler>(NotificationsScheduler);
    jest.clearAllMocks();
    mockNotifications.pushOnce.mockResolvedValue({ id: 1 });
  });

  it('returns 0 when there are no users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(0);
    expect(mockNotifications.pushOnce).not.toHaveBeenCalled();
  });

  it('creates one BUDGET_EXCEEDED notification when a budget is at 120%', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([
      {
        id: 1,
        categoryId: 9,
        categoryName: 'Food',
        amount: 200,
        period: 'MONTHLY',
        startDate: '2026-07-01',
        spent: 240,
        remaining: -40,
        percentUsed: 120,
        active: true,
      },
    ]);
    mockAccounts.getUserAccounts.mockResolvedValue([]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(1);
    expect(mockNotifications.pushOnce).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'BUDGET_EXCEEDED',
        dedupeKey: 'budget-1-202607',
      }),
    );
  });

  it('does not create a BUDGET_EXCEEDED notification for budgets under 100%', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([
      {
        id: 1,
        categoryId: 9,
        categoryName: 'Food',
        amount: 200,
        period: 'MONTHLY',
        startDate: '2026-07-01',
        spent: 100,
        remaining: 100,
        percentUsed: 50,
        active: true,
      },
    ]);
    mockAccounts.getUserAccounts.mockResolvedValue([]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(0);
    expect(mockNotifications.pushOnce).not.toHaveBeenCalled();
  });

  it('skips inactive budgets', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([
      {
        id: 1,
        categoryId: 9,
        categoryName: 'Food',
        amount: 200,
        period: 'MONTHLY',
        startDate: '2026-07-01',
        spent: 240,
        remaining: -40,
        percentUsed: 120,
        active: false,
      },
    ]);
    mockAccounts.getUserAccounts.mockResolvedValue([]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(0);
  });

  it('creates a LOW_BALANCE notification when an active account is below overdraftAt', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([]);
    mockAccounts.getUserAccounts.mockResolvedValue([
      {
        id: 99,
        name: 'Checking',
        active: true,
        currentBalance: 50,
        overdraftAt: 100,
      },
    ]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(1);
    expect(mockNotifications.pushOnce).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'LOW_BALANCE',
        dedupeKey: 'low-balance-99-20260715',
      }),
    );
  });

  it('does not create a LOW_BALANCE notification when balance equals overdraftAt', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([]);
    mockAccounts.getUserAccounts.mockResolvedValue([
      {
        id: 99,
        name: 'Checking',
        active: true,
        currentBalance: 100,
        overdraftAt: 100,
      },
    ]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(0);
  });

  it('skips inactive accounts for the LOW_BALANCE rule', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([]);
    mockAccounts.getUserAccounts.mockResolvedValue([
      {
        id: 99,
        name: 'Checking',
        active: false,
        currentBalance: 0,
        overdraftAt: 100,
      },
    ]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(0);
  });

  it('creates an UPCOMING_PAYMENT notification for recurring transactions within 3 days', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([]);
    mockAccounts.getUserAccounts.mockResolvedValue([]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([
      {
        id: BigInt(42),
        nextRunDate: new Date('2026-07-17T00:00:00Z'),
      },
    ]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(1);
    expect(mockNotifications.pushOnce).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'UPCOMING_PAYMENT',
        dedupeKey: 'upcoming-recurring-42-20260715',
      }),
    );
  });

  it('does not create an UPCOMING_PAYMENT notification for past-due recurring transactions', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([]);
    mockAccounts.getUserAccounts.mockResolvedValue([]);
    const today = new Date('2026-07-15T07:00:00Z');
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 3);
    mockPrisma.recurringTransaction.findMany.mockImplementation(
      ({ where }: { where: { nextRunDate: { gte: Date; lte: Date } } }) => {
        const pastRow = {
          id: BigInt(42),
          nextRunDate: new Date('2026-07-10T00:00:00Z'),
        };
        return Promise.resolve(
          [pastRow].filter(
            (r) =>
              r.nextRunDate >= where.nextRunDate.gte &&
              r.nextRunDate <= where.nextRunDate.lte,
          ),
        );
      },
    );

    const count = await scheduler.evaluateRules(today);

    expect(count).toBe(0);
  });

  it('does not create UPCOMING_PAYMENT for templates whose nextRunDate is more than 3 days away', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockResolvedValue([]);
    mockAccounts.getUserAccounts.mockResolvedValue([]);
    const today = new Date('2026-07-15T07:00:00Z');
    mockPrisma.recurringTransaction.findMany.mockImplementation(
      ({ where }: { where: { nextRunDate: { gte: Date; lte: Date } } }) => {
        const farRow = {
          id: BigInt(42),
          nextRunDate: new Date('2026-07-25T00:00:00Z'),
        };
        return Promise.resolve(
          [farRow].filter(
            (r) =>
              r.nextRunDate >= where.nextRunDate.gte &&
              r.nextRunDate <= where.nextRunDate.lte,
          ),
        );
      },
    );

    const count = await scheduler.evaluateRules(today);

    expect(count).toBe(0);
  });

  it('iterates each user independently', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      makeUser(BigInt(7)),
      makeUser(BigInt(8)),
    ]);
    mockBudgets.listBudgets
      .mockResolvedValueOnce([
        {
          id: 1,
          categoryId: 9,
          categoryName: 'Food',
          amount: 200,
          period: 'MONTHLY',
          startDate: '2026-07-01',
          spent: 240,
          remaining: -40,
          percentUsed: 120,
          active: true,
        },
      ])
      .mockResolvedValueOnce([]);
    mockAccounts.getUserAccounts.mockResolvedValue([]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(1);
    expect(mockBudgets.listBudgets).toHaveBeenCalledTimes(2);
    expect(mockBudgets.listBudgets).toHaveBeenNthCalledWith(1, 7);
    expect(mockBudgets.listBudgets).toHaveBeenNthCalledWith(2, 8);
    expect(mockNotifications.pushOnce).toHaveBeenCalledTimes(1);
    expect(mockNotifications.pushOnce).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: 'BUDGET_EXCEEDED' }),
    );
  });

  it('isolates failures in one rule from the others (try/catch per rule)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeUser(BigInt(7))]);
    mockBudgets.listBudgets.mockRejectedValue(new Error('boom'));
    mockAccounts.getUserAccounts.mockResolvedValue([
      {
        id: 99,
        name: 'Checking',
        active: true,
        currentBalance: 0,
        overdraftAt: 100,
      },
    ]);
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.evaluateRules(
      new Date('2026-07-15T07:00:00Z'),
    );

    expect(count).toBe(1);
    expect(mockNotifications.pushOnce).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: 'LOW_BALANCE' }),
    );
  });
});
