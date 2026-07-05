import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { GoalsService } from './goals.service';
import type { CreateGoalDto } from './dto/create-goal.dto';
import type { UpdateGoalDto } from './dto/update-goal.dto';

const makeGoal = (
  id: bigint,
  opts: {
    name?: string;
    targetAmount?: number;
    currentAmount?: number;
    targetDate?: Date | null;
    accountId?: bigint | null;
    accountName?: string | null;
  } = {},
) => ({
  id,
  userId: BigInt(1),
  name: opts.name ?? 'New car',
  targetAmount: new Prisma.Decimal(opts.targetAmount ?? 1000),
  currentAmount: new Prisma.Decimal(opts.currentAmount ?? 250),
  targetDate: opts.targetDate ?? null,
  accountId: opts.accountId ?? null,
  isAchieved: false,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  account:
    opts.accountId !== undefined && opts.accountId !== null
      ? { name: opts.accountName ?? 'Savings' }
      : null,
});

describe('GoalsService', () => {
  let service: GoalsService;

  const mockPrisma = {
    goal: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockAccountsService = {
    getAccount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountsService, useValue: mockAccountsService },
      ],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
    jest.clearAllMocks();
  });

  describe('listGoals', () => {
    it('computes remaining and percentComplete for a manual goal', async () => {
      mockPrisma.goal.findMany.mockResolvedValue([
        makeGoal(BigInt(1), { targetAmount: 1000, currentAmount: 250 }),
      ]);

      const res = await service.listGoals(1);

      expect(res[0].currentAmount).toBe(250);
      expect(res[0].remaining).toBe(750);
      expect(res[0].percentComplete).toBe(25);
      expect(res[0].isAchieved).toBe(false);
    });

    it('takes currentAmount from the linked account balance', async () => {
      mockPrisma.goal.findMany.mockResolvedValue([
        makeGoal(BigInt(1), {
          targetAmount: 1000,
          currentAmount: 250,
          accountId: BigInt(9),
          accountName: 'Emergency fund',
        }),
      ]);
      mockAccountsService.getAccount.mockResolvedValue({
        currentBalance: 400,
      });

      const res = await service.listGoals(1);

      expect(mockAccountsService.getAccount).toHaveBeenCalledWith(1, 9);
      expect(res[0].currentAmount).toBe(400);
      expect(res[0].remaining).toBe(600);
      expect(res[0].percentComplete).toBe(40);
      expect(res[0].accountName).toBe('Emergency fund');
    });

    it('marks the goal as achieved once currentAmount reaches targetAmount', async () => {
      mockPrisma.goal.findMany.mockResolvedValue([
        makeGoal(BigInt(1), { targetAmount: 1000, currentAmount: 1200 }),
      ]);

      const res = await service.listGoals(1);

      expect(res[0].isAchieved).toBe(true);
      expect(res[0].remaining).toBe(0);
      expect(res[0].percentComplete).toBe(100);
    });
  });

  describe('createGoal', () => {
    const dto: CreateGoalDto = { name: 'New car', targetAmount: 1000 };

    it('creates a goal with currentAmount starting at zero', async () => {
      mockPrisma.goal.create.mockResolvedValue(
        makeGoal(BigInt(1), { currentAmount: 0 }),
      );

      const res = await service.createGoal(1, dto);

      expect(mockPrisma.goal.create).toHaveBeenCalled();
      expect(res.name).toBe('New car');
      expect(res.currentAmount).toBe(0);
    });

    it('validates the linked account belongs to the user', async () => {
      mockAccountsService.getAccount.mockRejectedValue(
        new NotFoundException('Account was not found'),
      );

      await expect(
        service.createGoal(1, { ...dto, accountId: 999 }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.goal.create).not.toHaveBeenCalled();
    });
  });

  describe('updateGoal', () => {
    it('throws NotFoundException when the goal does not belong to the user', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue(null);

      const dto: UpdateGoalDto = { currentAmount: 300 };
      await expect(service.updateGoal(1, 99, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.goal.update).not.toHaveBeenCalled();
    });

    it('adds a manual contribution via currentAmount', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue({ id: BigInt(1) });
      mockPrisma.goal.update.mockResolvedValue(
        makeGoal(BigInt(1), { currentAmount: 300 }),
      );

      const res = await service.updateGoal(1, 1, { currentAmount: 300 });

      expect(mockPrisma.goal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(1) },
          data: expect.objectContaining({
            currentAmount: new Prisma.Decimal(300),
          }),
        }),
      );
      expect(res.currentAmount).toBe(300);
    });
  });

  describe('deleteGoal', () => {
    it('throws NotFoundException when the goal does not belong to the user', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue(null);

      await expect(service.deleteGoal(1, 99)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.goal.delete).not.toHaveBeenCalled();
    });

    it('deletes the goal', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue({ id: BigInt(1) });
      mockPrisma.goal.delete.mockResolvedValue(undefined);

      await service.deleteGoal(1, 1);

      expect(mockPrisma.goal.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      });
    });
  });
});
