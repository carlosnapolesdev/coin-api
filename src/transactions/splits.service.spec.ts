import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SplitsService } from './splits.service';
import type { SetSplitsDto } from './dto/set-splits.dto';

const makeTransaction = (
  overrides: {
    id?: bigint;
    userId?: bigint;
    type?: string;
    amount?: number;
    transferGroupId?: string | null;
    categoryId?: bigint | null;
  } = {},
) => ({
  id: overrides.id ?? BigInt(100),
  userId: overrides.userId ?? BigInt(1),
  accountId: BigInt(10),
  categoryId:
    overrides.categoryId !== undefined ? overrides.categoryId : BigInt(5),
  type: overrides.type ?? 'EXPENSE',
  amount: new Prisma.Decimal(overrides.amount ?? 100),
  effectiveDate: new Date('2026-07-10T00:00:00.000Z'),
  payee: null,
  paymentMethod: null,
  memo: null,
  status: 'CLEARED',
  tags: null,
  transferGroupId:
    overrides.transferGroupId !== undefined ? overrides.transferGroupId : null,
  transferAccountId: null,
  transferIn: null,
  exchangeRate: null,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  account: {
    id: BigInt(10),
    userId: BigInt(1),
    name: 'Checking',
    institution: null,
    type: 'BANK',
    accountNumber: null,
    currencyId: null,
    groupName: null,
    startBalance: new Prisma.Decimal(0),
    notes: null,
    icon: null,
    isClosed: false,
    isActive: true,
    defaultTemplate: 'NONE',
    excludeFromAccountSummary: false,
    outlineIntoSummary: false,
    excludeFromBudget: false,
    excludeFromAnyReports: false,
    overdraftAt: new Prisma.Decimal(0),
    maximumBalance: new Prisma.Decimal(0),
    checkbook1: 0,
    checkbook2: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  userCategory: {
    id: BigInt(5),
    userId: BigInt(1),
    type: 'EXPENSE',
    name: 'Food',
    icon: null,
    parentId: null,
    isActive: true,
    isCustom: false,
    sourceCategoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  _count: {
    attachments: 0,
    splits: 0,
  },
});

describe('SplitsService', () => {
  let service: SplitsService;

  const mockPrisma = {
    transaction: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    transactionSplit: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    userCategory: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(SplitsService);
    jest.clearAllMocks();
  });

  describe('getSplits', () => {
    it('returns split DTOs with category name', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());
      mockPrisma.transactionSplit.findMany.mockResolvedValue([
        {
          id: BigInt(1),
          transactionId: BigInt(100),
          categoryId: BigInt(5),
          amount: new Prisma.Decimal(60),
          memo: 'a',
          createdAt: new Date(),
          category: { name: 'Food' },
        },
        {
          id: BigInt(2),
          transactionId: BigInt(100),
          categoryId: BigInt(6),
          amount: new Prisma.Decimal(40),
          memo: null,
          createdAt: new Date(),
          category: { name: 'Household' },
        },
      ]);

      const res = await service.getSplits(1, 100);

      expect(res).toEqual([
        { id: 1, categoryId: 5, categoryName: 'Food', amount: 60, memo: 'a' },
        {
          id: 2,
          categoryId: 6,
          categoryName: 'Household',
          amount: 40,
          memo: null,
        },
      ]);
    });

    it('throws NotFoundException when transaction does not belong to user', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      await expect(service.getSplits(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setSplits — validations', () => {
    const dto: SetSplitsDto = {
      splits: [
        { categoryId: 5, amount: 60 },
        { categoryId: 6, amount: 40 },
      ],
    };

    it('throws NotFoundException when transaction does not belong to user', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      await expect(service.setSplits(1, 99, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException for transfer transactions', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(
        makeTransaction({ transferGroupId: 'grp-1' }),
      );
      await expect(service.setSplits(1, 100, dto)).rejects.toThrow(
        'Splits are not supported for transfers',
      );
    });

    it('throws BadRequestException when only one split is provided', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());
      await expect(
        service.setSplits(1, 100, { splits: [{ categoryId: 5, amount: 100 }] }),
      ).rejects.toThrow(/at least two entries/);
    });

    it('throws BadRequestException when sum does not match transaction amount', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());
      mockPrisma.userCategory.findMany.mockResolvedValue([
        { id: BigInt(5), isActive: true, type: 'EXPENSE' },
        { id: BigInt(6), isActive: true, type: 'EXPENSE' },
      ]);

      await expect(
        service.setSplits(1, 100, {
          splits: [
            { categoryId: 5, amount: 60 },
            { categoryId: 6, amount: 30 },
          ],
        }),
      ).rejects.toThrow(/sum to the transaction amount/);
    });

    it('throws NotFoundException when a category does not belong to the user', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());
      mockPrisma.userCategory.findMany.mockResolvedValue([
        { id: BigInt(5), isActive: true, type: 'EXPENSE' },
      ]);

      await expect(service.setSplits(1, 100, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when a category is inactive', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());
      mockPrisma.userCategory.findMany.mockResolvedValue([
        { id: BigInt(5), isActive: true, type: 'EXPENSE' },
        { id: BigInt(6), isActive: false, type: 'EXPENSE' },
      ]);

      await expect(service.setSplits(1, 100, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when category type differs from tx type', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());
      mockPrisma.userCategory.findMany.mockResolvedValue([
        { id: BigInt(5), isActive: true, type: 'EXPENSE' },
        { id: BigInt(6), isActive: true, type: 'INCOME' },
      ]);

      await expect(service.setSplits(1, 100, dto)).rejects.toThrow(
        /match the transaction type/,
      );
    });
  });

  describe('setSplits — happy path', () => {
    it('persists the splits, nulls the parent category, and returns the updated tx', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());
      mockPrisma.userCategory.findMany.mockResolvedValue([
        { id: BigInt(5), isActive: true, type: 'EXPENSE' },
        { id: BigInt(6), isActive: true, type: 'EXPENSE' },
      ]);

      const updatedTx = {
        ...makeTransaction({ categoryId: null }),
        userCategory: null,
        _count: { attachments: 0, splits: 2 },
      };
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
      );
      mockPrisma.transaction.update.mockResolvedValue(updatedTx);

      const res = await service.setSplits(1, 100, {
        splits: [
          { categoryId: 5, amount: 60, memo: 'a' },
          { categoryId: 6, amount: 40 },
        ],
      });

      expect(mockPrisma.transactionSplit.deleteMany).toHaveBeenCalledWith({
        where: { transactionId: BigInt(100) },
      });
      expect(mockPrisma.transactionSplit.createMany).toHaveBeenCalledWith({
        data: [
          {
            transactionId: BigInt(100),
            categoryId: BigInt(5),
            amount: new Prisma.Decimal(60),
            memo: 'a',
          },
          {
            transactionId: BigInt(100),
            categoryId: BigInt(6),
            amount: new Prisma.Decimal(40),
            memo: null,
          },
        ],
      });
      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(100) },
          data: expect.objectContaining({ categoryId: null }),
        }),
      );
      expect(res.splitCount).toBe(2);
      expect(res.categoryId).toBeNull();
    });

    it('with empty array clears all splits and keeps the parent category', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(makeTransaction());

      const updatedTx = makeTransaction({ categoryId: BigInt(5) });
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
      );
      mockPrisma.transaction.update.mockResolvedValue(updatedTx);

      const res = await service.setSplits(1, 100, { splits: [] });

      expect(mockPrisma.transactionSplit.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.transactionSplit.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: BigInt(5) }),
        }),
      );
      expect(res.categoryId).toBe(5);
    });
  });
});
