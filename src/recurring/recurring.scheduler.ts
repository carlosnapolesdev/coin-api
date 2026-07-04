import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { RecurrenceFrequency, TransactionType } from '../common/enums';
import { computeNextRunDate } from './recurring.service';
import type { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';

type RecurringTemplate = Prisma.RecurringTransactionGetPayload<object>;

@Injectable()
export class RecurringScheduler {
  private readonly logger = new Logger(RecurringScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
  ) {}

  @Cron('0 6 * * *')
  async handleCron(): Promise<void> {
    const created = await this.materializeDue();
    if (created > 0) {
      this.logger.log(`Materialized ${created} recurring transaction(s)`);
    }
  }

  async materializeDue(today: Date = new Date()): Promise<number> {
    const due = await this.prisma.recurringTransaction.findMany({
      where: { isActive: true, nextRunDate: { lte: today } },
    });

    for (const template of due) {
      await this.materializeOne(template, template.nextRunDate);
    }

    return due.length;
  }

  async runNow(userId: number, id: number): Promise<TransactionResponseDto> {
    const template = await this.prisma.recurringTransaction.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId) },
    });
    if (!template) {
      throw new NotFoundException('Recurring transaction was not found');
    }
    return this.materializeOne(template, new Date());
  }

  private async materializeOne(
    template: RecurringTemplate,
    effectiveDate: Date,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.transactionsService.createTransaction(
      Number(template.userId),
      {
        accountId: Number(template.accountId),
        categoryId: template.categoryId
          ? Number(template.categoryId)
          : undefined,
        destinationAccountId: template.destinationAccountId
          ? Number(template.destinationAccountId)
          : undefined,
        type: template.type as TransactionType,
        amount: template.amount.toNumber(),
        effectiveDate: effectiveDate.toISOString().split('T')[0],
        payee: template.payee ?? undefined,
        memo: template.memo ?? undefined,
        tags: template.tags ?? undefined,
      },
    );

    const nextRunDate = computeNextRunDate(
      template.nextRunDate,
      template.frequency as RecurrenceFrequency,
      template.interval,
    );
    const isActive = template.endDate ? nextRunDate <= template.endDate : true;

    await this.prisma.recurringTransaction.update({
      where: { id: template.id },
      data: {
        lastRunDate: effectiveDate,
        nextRunDate,
        isActive,
        updatedAt: new Date(),
      },
    });

    return transaction;
  }
}
