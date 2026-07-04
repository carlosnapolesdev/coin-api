import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';
import type { CreateBudgetDto } from './dto/create-budget.dto';
import type { UpdateBudgetDto } from './dto/update-budget.dto';

const makeBudget = (
  id: bigint,
  opts: {
    categoryId?: bigint;
    amount?: number;
    categoryName?: string | null;
    isActive?: boolean | null;
  } = {},
) => ({
  id,
  userId: BigInt(1),
  categoryId: opts.categoryId ?? BigInt(9),
  amount: new Prisma.Decimal(opts.amount ?? 200),
  period: 'MONTHLY',
  startDate: new Date('2026-07-01'),
  isActive: opts.isActive ?? true,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  category: { name: opts.categoryName ?? 'Food' },
});

describe('BudgetsService', () => {
  let service: BudgetsService;

  const mockPrisma = {
    budget: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userCategory: { findFirst: jest.fn() },
    transaction: { aggregate: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BudgetsService>(BudgetsService);
    jest.clearAllMocks();
  });

  describe('listBudgets', () => {
    it('computes spent and remaining from current-month expenses', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget(BigInt(1))]);
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(150) },
      });

      const res = await service.listBudgets(1);

      expect(res[0].spent).toBe(150);
      expect(res[0].remaining).toBe(50);
      expect(res[0].percentUsed).toBe(75);
    });

    it('treats a null aggregate sum as zero spent', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget(BigInt(1))]);
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      const res = await service.listBudgets(1);

      expect(res[0].spent).toBe(0);
      expect(res[0].remaining).toBe(200);
      expect(res[0].percentUsed).toBe(0);
    });

    it('excludes accounts with excludeFromBudget when aggregating', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget(BigInt(1))]);
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(0) },
      });

      await service.listBudgets(1);

      expect(mockPrisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            account: { excludeFromBudget: false },
          }),
        }),
      );
    });

    it('returns an empty array when the user has no budgets', async () => {
      mockPrisma.budget.findMany.mockResolvedValue([]);

      const res = await service.listBudgets(1);

      expect(res).toEqual([]);
    });
  });

  describe('createBudget', () => {
    const dto: CreateBudgetDto = { categoryId: 9, amount: 200 };

    it('creates a budget after verifying the category belongs to the user', async () => {
      mockPrisma.userCategory.findFirst.mockResolvedValue({ id: BigInt(9) });
      mockPrisma.budget.create.mockResolvedValue(undefined);
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget(BigInt(1))]);
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      const res = await service.createBudget(1, dto);

      expect(mockPrisma.budget.create).toHaveBeenCalled();
      expect(res.categoryId).toBe(9);
    });

    it('throws NotFoundException when the category does not belong to the user', async () => {
      mockPrisma.userCategory.findFirst.mockResolvedValue(null);

      await expect(service.createBudget(1, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.budget.create).not.toHaveBeenCalled();
    });
  });

  describe('updateBudget', () => {
    it('throws NotFoundException when the budget does not belong to the user', async () => {
      mockPrisma.budget.findFirst.mockResolvedValue(null);

      const dto: UpdateBudgetDto = { amount: 300 };
      await expect(service.updateBudget(1, 99, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.budget.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      mockPrisma.budget.findFirst.mockResolvedValue({ id: BigInt(1) });
      mockPrisma.budget.update.mockResolvedValue(undefined);
      mockPrisma.budget.findMany.mockResolvedValue([makeBudget(BigInt(1))]);
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      await service.updateBudget(1, 1, { amount: 300 });

      expect(mockPrisma.budget.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(1) },
          data: expect.objectContaining({ amount: new Prisma.Decimal(300) }),
        }),
      );
    });
  });

  describe('deleteBudget', () => {
    it('throws NotFoundException when the budget does not belong to the user', async () => {
      mockPrisma.budget.findFirst.mockResolvedValue(null);

      await expect(service.deleteBudget(1, 99)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.budget.delete).not.toHaveBeenCalled();
    });

    it('deletes the budget', async () => {
      mockPrisma.budget.findFirst.mockResolvedValue({ id: BigInt(1) });
      mockPrisma.budget.delete.mockResolvedValue(undefined);

      await service.deleteBudget(1, 1);

      expect(mockPrisma.budget.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      });
    });
  });
});
