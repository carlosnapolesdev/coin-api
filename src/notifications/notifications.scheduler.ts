import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { AccountsService } from '../accounts/accounts.service';
import { NotificationsService } from './notifications.service';

function yyyymm(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function yyyymmdd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function dayStartUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDaysUtc(date: Date, days: number): Date {
  const d = dayStartUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly budgetsService: BudgetsService,
    private readonly accountsService: AccountsService,
  ) {}

  @Cron('0 7 * * *')
  async handleCron(): Promise<void> {
    const generated = await this.evaluateRules(new Date());
    if (generated > 0) {
      this.logger.log(`Generated ${generated} notification(s)`);
    }
  }

  async evaluateRules(today: Date = new Date()): Promise<number> {
    let total = 0;
    const users = await this.prisma.user.findMany({ select: { id: true } });
    for (const u of users) {
      const userId = Number(u.id);
      total += await this.runSafe(
        () => this.evaluateBudgets(userId, today),
        `budgets(user=${userId})`,
      );
      total += await this.runSafe(
        () => this.evaluateLowBalance(userId, today),
        `accounts(user=${userId})`,
      );
      total += await this.runSafe(
        () => this.evaluateUpcomingRecurring(userId, today),
        `recurring(user=${userId})`,
      );
    }
    return total;
  }

  private async runSafe(
    fn: () => Promise<number>,
    label: string,
  ): Promise<number> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(
        `Notification rule failed: ${label} — ${(err as Error).message}`,
      );
      return 0;
    }
  }

  private async evaluateBudgets(userId: number, today: Date): Promise<number> {
    const budgets = await this.budgetsService.listBudgets(userId);
    let n = 0;
    const period = yyyymm(today);
    for (const b of budgets) {
      if (!b.active || b.percentUsed < 100) continue;
      const categoryLabel = b.categoryName ?? 'category';
      await this.notificationsService.pushOnce(userId, {
        type: 'BUDGET_EXCEEDED',
        title: `Budget exceeded: ${categoryLabel}`,
        body: `You have used ${b.percentUsed}% of your ${b.period.toLowerCase()} budget (${b.spent.toFixed(2)} of ${b.amount.toFixed(2)}).`,
        dedupeKey: `budget-${b.id}-${period}`,
      });
      n += 1;
    }
    return n;
  }

  private async evaluateLowBalance(
    userId: number,
    today: Date,
  ): Promise<number> {
    const accounts = await this.accountsService.getUserAccounts(userId, false);
    let n = 0;
    const day = yyyymmdd(today);
    for (const a of accounts) {
      if (!a.active) continue;
      if (a.currentBalance >= a.overdraftAt) continue;
      await this.notificationsService.pushOnce(userId, {
        type: 'LOW_BALANCE',
        title: `Low balance: ${a.name}`,
        body: `Balance ${a.currentBalance.toFixed(2)} is below threshold ${a.overdraftAt.toFixed(2)}.`,
        dedupeKey: `low-balance-${a.id}-${day}`,
      });
      n += 1;
    }
    return n;
  }

  private async evaluateUpcomingRecurring(
    userId: number,
    today: Date,
  ): Promise<number> {
    const start = dayStartUtc(today);
    const end = addDaysUtc(today, 3);
    const upcoming = await this.prisma.recurringTransaction.findMany({
      where: {
        userId: BigInt(userId),
        isActive: true,
        nextRunDate: { gte: start, lte: end },
      },
      select: { id: true, nextRunDate: true },
    });
    let n = 0;
    const day = yyyymmdd(today);
    for (const r of upcoming) {
      const when = r.nextRunDate.toISOString().split('T')[0];
      await this.notificationsService.pushOnce(userId, {
        type: 'UPCOMING_PAYMENT',
        title: 'Upcoming payment',
        body: `A recurring transaction is scheduled for ${when}.`,
        dedupeKey: `upcoming-recurring-${r.id}-${day}`,
      });
      n += 1;
    }
    return n;
  }
}
