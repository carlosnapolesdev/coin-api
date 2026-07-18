import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionStatus, TransactionType } from '../common/enums';
import { ReconciliationsService } from './reconciliations.service';

describe('ReconciliationsService', () => {
  let service: ReconciliationsService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    account: { findFirst: jest.fn() },
    reconciliation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ReconciliationsService);
  });

  const makeAccount = (id: bigint, startBalance: number) => ({
    id,
    userId: BigInt(1),
    name: 'Test Account',
    startBalance: new Prisma.Decimal(startBalance),
  });

  describe('open', () => {
    it('creates a reconciliation with clearedBalance=130 when start=100, +50 income, -20 expense', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(10), 100),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          amount: new Prisma.Decimal(50),
          type: TransactionType.INCOME,
          transferIn: null,
          status: TransactionStatus.CLEARED,
        },
        {
          amount: new Prisma.Decimal(20),
          type: TransactionType.EXPENSE,
          transferIn: null,
          status: TransactionStatus.CLEARED,
        },
      ]);
      mockPrisma.reconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: BigInt(1),
          ...data,
          isCompleted: data.isCompleted ?? false,
          completedAt: data.completedAt ?? null,
          createdAt: new Date('2024-06-01'),
          updatedAt: new Date('2024-06-01'),
        }),
      );

      const result = await service.open(1, 10, {
        statementDate: '2024-06-30',
        statementBalance: 130,
      });

      expect(result.accountId).toBe(10);
      expect(result.statementBalance).toBe(130);
      expect(result.clearedBalance).toBe(130);
      expect(result.difference).toBe(0);
      expect(result.isCompleted).toBe(false);
    });

    it('computes difference correctly when statementBalance diverges', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(10), 100),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          amount: new Prisma.Decimal(50),
          type: TransactionType.INCOME,
          transferIn: null,
          status: TransactionStatus.CLEARED,
        },
      ]);
      mockPrisma.reconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: BigInt(1),
          ...data,
          isCompleted: data.isCompleted ?? false,
          completedAt: data.completedAt ?? null,
          createdAt: new Date('2024-06-01'),
          updatedAt: new Date('2024-06-01'),
        }),
      );

      const result = await service.open(1, 10, {
        statementDate: '2024-06-30',
        statementBalance: 125,
      });

      expect(result.clearedBalance).toBe(150);
      expect(result.statementBalance).toBe(125);
      expect(result.difference).toBe(-25);
    });

    it('throws NotFound when the account does not belong to the user', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.open(1, 99, {
          statementDate: '2024-06-30',
          statementBalance: 100,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('counts transfer-in legs as inflows (consistent with F1)', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(10), 0),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          amount: new Prisma.Decimal(4000),
          type: TransactionType.TRANSFER,
          transferIn: true,
          status: TransactionStatus.CLEARED,
        },
        {
          amount: new Prisma.Decimal(100),
          type: TransactionType.TRANSFER,
          transferIn: false,
          status: TransactionStatus.CLEARED,
        },
      ]);
      mockPrisma.reconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: BigInt(1),
          ...data,
          isCompleted: false,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.open(1, 10, {
        statementDate: '2024-06-30',
        statementBalance: 3900,
      });
      expect(result.clearedBalance).toBe(3900);
      expect(result.difference).toBe(0);
    });

    it('ignores PENDING and VOID transactions when computing clearedBalance', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(10), 100),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          amount: new Prisma.Decimal(50),
          type: TransactionType.INCOME,
          transferIn: null,
          status: TransactionStatus.CLEARED,
        },
      ]);
      mockPrisma.reconciliation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: BigInt(1),
          ...data,
          isCompleted: false,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.open(1, 10, {
        statementDate: '2024-06-30',
        statementBalance: 150,
      });
      expect(result.clearedBalance).toBe(150);
    });
  });

  describe('getSummary', () => {
    it('returns clearedBalance, statementBalance, difference and counts', async () => {
      mockPrisma.reconciliation.findFirst.mockResolvedValue({
        id: BigInt(7),
        userId: BigInt(1),
        accountId: BigInt(10),
        statementDate: new Date('2024-06-30'),
        statementBalance: new Prisma.Decimal(130),
        clearedBalance: new Prisma.Decimal(150),
        difference: new Prisma.Decimal(-20),
        isCompleted: false,
        completedAt: null,
        createdAt: new Date('2024-06-01'),
        updatedAt: new Date('2024-06-01'),
      });
      mockPrisma.transaction.groupBy.mockResolvedValue([
        { status: TransactionStatus.CLEARED, _count: { _all: 3 } },
        { status: TransactionStatus.PENDING, _count: { _all: 2 } },
      ]);

      const result = await service.getSummary(1, 7);

      expect(result).toEqual({
        id: 7,
        accountId: 10,
        statementDate: '2024-06-30',
        statementBalance: 130,
        clearedBalance: 150,
        difference: -20,
        isCompleted: false,
        clearedCount: 3,
        pendingCount: 2,
      });
    });

    it('throws NotFound when the reconciliation does not belong to the user', async () => {
      mockPrisma.reconciliation.findFirst.mockResolvedValue(null);
      await expect(service.getSummary(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('complete', () => {
    it('marks reconciliation as completed when difference is 0', async () => {
      mockPrisma.reconciliation.findFirst.mockResolvedValue({
        id: BigInt(7),
        userId: BigInt(1),
        accountId: BigInt(10),
        statementBalance: new Prisma.Decimal(130),
        clearedBalance: new Prisma.Decimal(130),
        difference: new Prisma.Decimal(0),
        isCompleted: false,
      });
      mockPrisma.reconciliation.update.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: BigInt(7),
          userId: BigInt(1),
          accountId: BigInt(10),
          statementDate: new Date('2024-06-30'),
          statementBalance: new Prisma.Decimal(130),
          clearedBalance: new Prisma.Decimal(130),
          difference: new Prisma.Decimal(0),
          isCompleted: data.isCompleted,
          completedAt: data.completedAt,
          createdAt: new Date('2024-06-01'),
          updatedAt: new Date('2024-06-01'),
        }),
      );

      const result = await service.complete(1, 7);
      expect(result.isCompleted).toBe(true);
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('throws BadRequest when difference is not 0', async () => {
      mockPrisma.reconciliation.findFirst.mockResolvedValue({
        id: BigInt(7),
        userId: BigInt(1),
        accountId: BigInt(10),
        statementBalance: new Prisma.Decimal(100),
        clearedBalance: new Prisma.Decimal(120),
        difference: new Prisma.Decimal(-20),
        isCompleted: false,
      });

      await expect(service.complete(1, 7)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.complete(1, 7)).rejects.toThrow(
        'Reconciliation is not balanced',
      );
    });

    it('throws NotFound when the reconciliation does not exist', async () => {
      mockPrisma.reconciliation.findFirst.mockResolvedValue(null);
      await expect(service.complete(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
