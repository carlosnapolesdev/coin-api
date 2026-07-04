import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecurringService, computeNextRunDate } from './recurring.service';
import { RecurrenceFrequency, TransactionType } from '../common/enums';
import type { CreateRecurringDto } from './dto/create-recurring.dto';

describe('computeNextRunDate', () => {
  it('advances one month for MONTHLY/1', () => {
    const next = computeNextRunDate(
      new Date('2026-07-01'),
      RecurrenceFrequency.MONTHLY,
      1,
    );
    expect(next.toISOString().split('T')[0]).toBe('2026-08-01');
  });

  it('advances two weeks for WEEKLY/2', () => {
    const next = computeNextRunDate(
      new Date('2026-07-01'),
      RecurrenceFrequency.WEEKLY,
      2,
    );
    expect(next.toISOString().split('T')[0]).toBe('2026-07-15');
  });

  it('advances one day for DAILY/1', () => {
    const next = computeNextRunDate(
      new Date('2026-07-01'),
      RecurrenceFrequency.DAILY,
      1,
    );
    expect(next.toISOString().split('T')[0]).toBe('2026-07-02');
  });

  it('advances one year for YEARLY/1', () => {
    const next = computeNextRunDate(
      new Date('2026-07-01'),
      RecurrenceFrequency.YEARLY,
      1,
    );
    expect(next.toISOString().split('T')[0]).toBe('2027-07-01');
  });
});

const makeRow = (
  id: bigint,
  opts: {
    accountId?: bigint;
    accountName?: string | null;
    categoryId?: bigint | null;
    isActive?: boolean;
  } = {},
) => ({
  id,
  userId: BigInt(1),
  accountId: opts.accountId ?? BigInt(9),
  categoryId: opts.categoryId ?? null,
  destinationAccountId: null,
  type: TransactionType.EXPENSE,
  amount: new Prisma.Decimal(100),
  frequency: RecurrenceFrequency.MONTHLY,
  interval: 1,
  nextRunDate: new Date('2026-08-01'),
  lastRunDate: null,
  endDate: null,
  payee: null,
  memo: null,
  tags: null,
  isActive: opts.isActive ?? true,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  account: { name: opts.accountName ?? 'Checking' },
  destinationAccount: null,
  userCategory: null,
});

describe('RecurringService', () => {
  let service: RecurringService;

  const mockPrisma = {
    recurringTransaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    account: { findFirst: jest.fn() },
    userCategory: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RecurringService>(RecurringService);
    jest.clearAllMocks();
  });

  describe('createRecurring', () => {
    const dto: CreateRecurringDto = {
      accountId: 9,
      type: TransactionType.EXPENSE,
      amount: 100,
      frequency: RecurrenceFrequency.MONTHLY,
      startDate: '2026-08-01',
    };

    it('creates a template with nextRunDate set to startDate', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: BigInt(9) });
      mockPrisma.recurringTransaction.create.mockResolvedValue(
        makeRow(BigInt(1)),
      );

      const res = await service.createRecurring(1, dto);

      expect(mockPrisma.recurringTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextRunDate: new Date('2026-08-01'),
            interval: 1,
            isActive: true,
          }),
        }),
      );
      expect(res.accountId).toBe(9);
    });

    it('throws NotFoundException when the account does not belong to the user', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(service.createRecurring(1, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.recurringTransaction.create).not.toHaveBeenCalled();
    });

    it('requires a destination account for TRANSFER templates', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: BigInt(9) });
      const transferDto: CreateRecurringDto = {
        ...dto,
        type: TransactionType.TRANSFER,
      };

      await expect(service.createRecurring(1, transferDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.recurringTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRecurring', () => {
    it('throws NotFoundException when the template does not belong to the user', async () => {
      mockPrisma.recurringTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRecurring(1, 99, { isActive: false }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.recurringTransaction.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      mockPrisma.recurringTransaction.findFirst.mockResolvedValue({
        id: BigInt(1),
      });
      mockPrisma.recurringTransaction.update.mockResolvedValue(
        makeRow(BigInt(1), { isActive: false }),
      );

      await service.updateRecurring(1, 1, { isActive: false });

      expect(mockPrisma.recurringTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(1) },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });
  });

  describe('deleteRecurring', () => {
    it('throws NotFoundException when the template does not belong to the user', async () => {
      mockPrisma.recurringTransaction.findFirst.mockResolvedValue(null);

      await expect(service.deleteRecurring(1, 99)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.recurringTransaction.delete).not.toHaveBeenCalled();
    });

    it('deletes the template', async () => {
      mockPrisma.recurringTransaction.findFirst.mockResolvedValue({
        id: BigInt(1),
      });
      mockPrisma.recurringTransaction.delete.mockResolvedValue(undefined);

      await service.deleteRecurring(1, 1);

      expect(mockPrisma.recurringTransaction.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      });
    });
  });
});
