import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import type { CreateGoalDto, UpdateGoalDto, GoalResponseDto } from './dto';

type GoalWithAccount = Prisma.GoalGetPayload<{ include: { account: true } }>;

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async listGoals(userId: number): Promise<GoalResponseDto[]> {
    const goals = await this.prisma.goal.findMany({
      where: { userId: BigInt(userId) },
      include: { account: true },
      orderBy: { id: 'asc' },
    });
    return Promise.all(goals.map((g) => this.toGoalResponse(userId, g)));
  }

  async createGoal(
    userId: number,
    dto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    if (dto.accountId !== undefined) {
      await this.accountsService.getAccount(userId, dto.accountId);
    }
    const now = new Date();
    const created = await this.prisma.goal.create({
      data: {
        userId: BigInt(userId),
        name: dto.name,
        targetAmount: new Prisma.Decimal(dto.targetAmount),
        currentAmount: new Prisma.Decimal(0),
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        accountId: dto.accountId !== undefined ? BigInt(dto.accountId) : null,
        isAchieved: false,
        createdAt: now,
        updatedAt: now,
      },
      include: { account: true },
    });
    return this.toGoalResponse(userId, created);
  }

  async updateGoal(
    userId: number,
    id: number,
    dto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    await this.ensureGoal(userId, id);
    if (dto.accountId !== undefined) {
      await this.accountsService.getAccount(userId, dto.accountId);
    }

    const data: Prisma.GoalUpdateInput = { updatedAt: new Date() };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.targetAmount !== undefined)
      data.targetAmount = new Prisma.Decimal(dto.targetAmount);
    if (dto.targetDate !== undefined) {
      data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    }
    if (dto.accountId !== undefined) {
      data.account = { connect: { id: BigInt(dto.accountId) } };
    }
    if (dto.currentAmount !== undefined) {
      data.currentAmount = new Prisma.Decimal(dto.currentAmount);
    }

    const updated = await this.prisma.goal.update({
      where: { id: BigInt(id) },
      data,
      include: { account: true },
    });
    return this.toGoalResponse(userId, updated);
  }

  async deleteGoal(userId: number, id: number): Promise<void> {
    await this.ensureGoal(userId, id);
    await this.prisma.goal.delete({ where: { id: BigInt(id) } });
  }

  private async ensureGoal(userId: number, id: number): Promise<void> {
    const g = await this.prisma.goal.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId) },
      select: { id: true },
    });
    if (!g) throw new NotFoundException('Goal was not found');
  }

  private async toGoalResponse(
    userId: number,
    goal: GoalWithAccount,
  ): Promise<GoalResponseDto> {
    const targetAmount = goal.targetAmount.toNumber();
    let currentAmount = goal.currentAmount.toNumber();
    if (goal.accountId !== null) {
      const account = await this.accountsService.getAccount(
        userId,
        Number(goal.accountId),
      );
      currentAmount = account.currentBalance;
    }
    const isAchieved = currentAmount >= targetAmount;

    return {
      id: Number(goal.id),
      name: goal.name,
      targetAmount,
      currentAmount,
      remaining: Math.max(targetAmount - currentAmount, 0),
      percentComplete:
        targetAmount > 0
          ? Math.min(Math.round((currentAmount / targetAmount) * 100), 100)
          : 0,
      targetDate: goal.targetDate
        ? goal.targetDate.toISOString().split('T')[0]
        : null,
      accountId: goal.accountId !== null ? Number(goal.accountId) : null,
      accountName: goal.account?.name ?? null,
      isAchieved,
    };
  }
}
