import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '../common/enums';
import type {
  ReportRangeDto,
  MonthlyPointDto,
  CategoryTotalDto,
  NetWorthPointDto,
} from './dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async incomeVsExpense(
    userId: number,
    range: ReportRangeDto,
  ): Promise<MonthlyPointDto[]> {
    const { from, to } = this.resolveRange(range);
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId: BigInt(userId),
        effectiveDate: { gte: from, lte: to },
        type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
        account: { excludeFromAnyReports: false },
      },
      select: { type: true, amount: true, effectiveDate: true },
    });
    const map = new Map<string, MonthlyPointDto>();
    for (const r of rows) {
      const month = r.effectiveDate.toISOString().slice(0, 7);
      const p = map.get(month) ?? { month, income: 0, expense: 0, net: 0 };
      if (r.type === (TransactionType.INCOME as string)) {
        p.income += r.amount.toNumber();
      } else {
        p.expense += r.amount.toNumber();
      }
      p.net = p.income - p.expense;
      map.set(month, p);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.month.localeCompare(b.month),
    );
  }

  async categoryBreakdown(
    userId: number,
    range: ReportRangeDto,
  ): Promise<CategoryTotalDto[]> {
    const { from, to } = this.resolveRange(range);
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId: BigInt(userId),
        type: TransactionType.EXPENSE,
        effectiveDate: { gte: from, lte: to },
        account: { excludeFromAnyReports: false },
      },
      select: {
        amount: true,
        categoryId: true,
        userCategory: { select: { name: true } },
        splits: {
          select: {
            amount: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        },
      },
    });
    const map = new Map<string, CategoryTotalDto>();
    for (const r of rows) {
      if (r.splits.length > 0) {
        for (const split of r.splits) {
          const key = String(split.categoryId);
          const name = split.category?.name ?? 'Uncategorized';
          const entry = map.get(key) ?? {
            categoryId: Number(split.categoryId),
            categoryName: name,
            total: 0,
          };
          entry.total += split.amount.toNumber();
          map.set(key, entry);
        }
      } else {
        const key = r.categoryId ? String(r.categoryId) : 'none';
        const name = r.userCategory?.name ?? 'Uncategorized';
        const entry = map.get(key) ?? {
          categoryId: r.categoryId ? Number(r.categoryId) : null,
          categoryName: name,
          total: 0,
        };
        entry.total += r.amount.toNumber();
        map.set(key, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }

  async netWorthTrend(
    userId: number,
    range: ReportRangeDto,
  ): Promise<NetWorthPointDto[]> {
    const { from, to } = this.resolveRange(range);
    const accounts = await this.prisma.account.findMany({
      where: {
        userId: BigInt(userId),
        isActive: true,
        excludeFromAnyReports: false,
      },
      select: { startBalance: true },
    });
    const base = accounts.reduce(
      (s, a) => s + (a.startBalance?.toNumber() ?? 0),
      0,
    );
    const monthly = await this.incomeVsExpense(userId, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
    let running = base;
    return monthly.map((m) => {
      running += m.net;
      return { month: m.month, balance: running };
    });
  }

  private resolveRange(range: ReportRangeDto): { from: Date; to: Date } {
    const to = range.to ? new Date(range.to) : new Date();
    const from = range.from
      ? new Date(range.from)
      : new Date(to.getFullYear(), to.getMonth() - 11, 1);
    return { from, to };
  }
}
