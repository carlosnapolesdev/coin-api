import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '../common/enums';
import type {
  CreateBudgetDto,
  UpdateBudgetDto,
  BudgetResponseDto,
} from './dto';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBudgets(userId: number): Promise<BudgetResponseDto[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId: BigInt(userId) },
      include: { category: true },
      orderBy: { id: 'asc' },
    });
    const { gte, lte } = this.currentMonthRange();
    return Promise.all(
      budgets.map(async (b) => {
        const txWhere = {
          userId: BigInt(userId),
          categoryId: b.categoryId,
          type: TransactionType.EXPENSE,
          effectiveDate: { gte, lte },
          account: { excludeFromBudget: false },
        };
        const [txAgg, splitAgg] = await Promise.all([
          this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: txWhere,
          }),
          this.prisma.transactionSplit.aggregate({
            _sum: { amount: true },
            where: {
              categoryId: b.categoryId,
              transaction: {
                userId: BigInt(userId),
                type: TransactionType.EXPENSE,
                effectiveDate: { gte, lte },
                account: { excludeFromBudget: false },
              },
            },
          }),
        ]);
        const amount = b.amount.toNumber();
        const txSum = txAgg._sum.amount ? txAgg._sum.amount.toNumber() : 0;
        const splitSum = splitAgg._sum.amount
          ? splitAgg._sum.amount.toNumber()
          : 0;
        const spent = txSum + splitSum;
        return {
          id: Number(b.id),
          categoryId: Number(b.categoryId),
          categoryName: b.category?.name ?? null,
          amount,
          period: b.period,
          startDate: b.startDate.toISOString().split('T')[0],
          spent,
          remaining: amount - spent,
          percentUsed: amount > 0 ? Math.round((spent / amount) * 100) : 0,
          active: b.isActive ?? true,
        };
      }),
    );
  }

  async createBudget(
    userId: number,
    dto: CreateBudgetDto,
  ): Promise<BudgetResponseDto> {
    await this.ensureCategory(userId, dto.categoryId);
    const now = new Date();
    await this.prisma.budget.create({
      data: {
        userId: BigInt(userId),
        categoryId: BigInt(dto.categoryId),
        amount: new Prisma.Decimal(dto.amount),
        period: dto.period ?? 'MONTHLY',
        startDate: dto.startDate
          ? new Date(dto.startDate)
          : this.currentMonthRange().gte,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    const list = await this.listBudgets(userId);
    return list.find((b) => b.categoryId === dto.categoryId)!;
  }

  async updateBudget(
    userId: number,
    id: number,
    dto: UpdateBudgetDto,
  ): Promise<BudgetResponseDto> {
    await this.ensureBudget(userId, id);
    const data: Prisma.BudgetUpdateInput = { updatedAt: new Date() };
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.period !== undefined) data.period = dto.period;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.active !== undefined) data.isActive = dto.active;
    await this.prisma.budget.update({ where: { id: BigInt(id) }, data });
    const list = await this.listBudgets(userId);
    return list.find((b) => b.id === id)!;
  }

  async deleteBudget(userId: number, id: number): Promise<void> {
    await this.ensureBudget(userId, id);
    await this.prisma.budget.delete({ where: { id: BigInt(id) } });
  }

  private currentMonthRange(): { gte: Date; lte: Date } {
    const now = new Date();
    return {
      gte: new Date(now.getFullYear(), now.getMonth(), 1),
      lte: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  private async ensureCategory(
    userId: number,
    categoryId: number,
  ): Promise<void> {
    const c = await this.prisma.userCategory.findFirst({
      where: { id: BigInt(categoryId), userId: BigInt(userId) },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Category was not found');
  }

  private async ensureBudget(userId: number, id: number): Promise<void> {
    const b = await this.prisma.budget.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId) },
      select: { id: true },
    });
    if (!b) throw new NotFoundException('Budget was not found');
  }
}
