import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { RecurringScheduler } from './recurring.scheduler';
import { RecurrenceFrequency, TransactionType } from '../common/enums';

const makeTemplate = (
  overrides: Partial<{
    nextRunDate: Date;
    endDate: Date | null;
    frequency: RecurrenceFrequency;
    interval: number;
  }> = {},
) => ({
  id: BigInt(1),
  userId: BigInt(7),
  accountId: BigInt(9),
  categoryId: BigInt(3),
  destinationAccountId: null,
  type: TransactionType.EXPENSE,
  amount: new Prisma.Decimal(1200),
  frequency: overrides.frequency ?? RecurrenceFrequency.MONTHLY,
  interval: overrides.interval ?? 1,
  nextRunDate: overrides.nextRunDate ?? new Date('2026-07-03'),
  lastRunDate: null,
  endDate: overrides.endDate ?? null,
  payee: 'Landlord',
  memo: null,
  tags: null,
  isActive: true,
});

describe('RecurringScheduler', () => {
  let scheduler: RecurringScheduler;

  const mockPrisma = {
    recurringTransaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockTransactionsService = {
    createTransaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TransactionsService, useValue: mockTransactionsService },
      ],
    }).compile();

    scheduler = module.get<RecurringScheduler>(RecurringScheduler);
    jest.clearAllMocks();
  });

  it('materializes a template whose nextRunDate is in the past', async () => {
    const template = makeTemplate({ nextRunDate: new Date('2026-07-03') });
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([template]);
    mockTransactionsService.createTransaction.mockResolvedValue({});
    mockPrisma.recurringTransaction.update.mockResolvedValue({});

    const count = await scheduler.materializeDue(new Date('2026-07-04'));

    expect(count).toBe(1);
    expect(mockTransactionsService.createTransaction).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        accountId: 9,
        categoryId: 3,
        type: TransactionType.EXPENSE,
        amount: 1200,
        effectiveDate: '2026-07-03',
        payee: 'Landlord',
      }),
    );
    expect(mockPrisma.recurringTransaction.update).toHaveBeenCalledWith({
      where: { id: BigInt(1) },
      data: expect.objectContaining({
        lastRunDate: new Date('2026-07-03'),
        nextRunDate: new Date('2026-08-03'),
        isActive: true,
      }),
    });
  });

  it('deactivates the template when the next run would be past endDate', async () => {
    const template = makeTemplate({
      nextRunDate: new Date('2026-07-03'),
      endDate: new Date('2026-07-20'),
    });
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([template]);
    mockTransactionsService.createTransaction.mockResolvedValue({});
    mockPrisma.recurringTransaction.update.mockResolvedValue({});

    await scheduler.materializeDue(new Date('2026-07-04'));

    expect(mockPrisma.recurringTransaction.update).toHaveBeenCalledWith({
      where: { id: BigInt(1) },
      data: expect.objectContaining({ isActive: false }),
    });
  });

  it('does nothing when there are no due templates', async () => {
    mockPrisma.recurringTransaction.findMany.mockResolvedValue([]);

    const count = await scheduler.materializeDue(new Date('2026-07-04'));

    expect(count).toBe(0);
    expect(mockTransactionsService.createTransaction).not.toHaveBeenCalled();
  });

  describe('runNow', () => {
    it('materializes a template on demand regardless of nextRunDate', async () => {
      const template = makeTemplate({ nextRunDate: new Date('2026-08-03') });
      mockPrisma.recurringTransaction.findFirst.mockResolvedValue(template);
      mockTransactionsService.createTransaction.mockResolvedValue({});
      mockPrisma.recurringTransaction.update.mockResolvedValue({});

      await scheduler.runNow(7, 1);

      expect(mockPrisma.recurringTransaction.findFirst).toHaveBeenCalledWith({
        where: { id: BigInt(1), userId: BigInt(7) },
      });
      expect(mockTransactionsService.createTransaction).toHaveBeenCalled();
      expect(mockPrisma.recurringTransaction.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when the template does not belong to the user', async () => {
      mockPrisma.recurringTransaction.findFirst.mockResolvedValue(null);

      await expect(scheduler.runNow(7, 99)).rejects.toThrow(NotFoundException);
      expect(mockTransactionsService.createTransaction).not.toHaveBeenCalled();
    });
  });
});
