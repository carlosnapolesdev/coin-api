import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionStatus, TransactionType } from '../common/enums';
import type { OpenReconciliationDto } from './dto/open-reconciliation.dto';
import type {
  ReconciliationResponseDto,
  ReconciliationSummaryDto,
} from './dto/reconciliation-response.dto';

type TransactionRow = {
  amount: Prisma.Decimal;
  type: string;
  transferIn: boolean | null;
  status: string;
};

type ReconciliationRow = {
  id: bigint;
  userId: bigint;
  accountId: bigint;
  statementDate: Date;
  statementBalance: Prisma.Decimal;
  clearedBalance: Prisma.Decimal;
  difference: Prisma.Decimal;
  isCompleted: boolean | null;
  completedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

@Injectable()
export class ReconciliationsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(
    userId: number,
    accountId: number,
    dto: OpenReconciliationDto,
  ): Promise<ReconciliationResponseDto> {
    const account = await this.findRequiredAccount(userId, accountId);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        accountId: account.id,
        userId: BigInt(userId),
        status: TransactionStatus.CLEARED,
      },
      select: {
        amount: true,
        type: true,
        transferIn: true,
        status: true,
      },
    });

    const clearedBalance = this.computeClearedBalance(
      account.startBalance ?? new Prisma.Decimal(0),
      transactions,
    );
    const statementBalance = new Prisma.Decimal(dto.statementBalance);
    const difference = statementBalance.sub(clearedBalance);

    const created = await this.prisma.reconciliation.create({
      data: {
        userId: BigInt(userId),
        accountId: account.id,
        statementDate: new Date(dto.statementDate),
        statementBalance,
        clearedBalance,
        difference,
        isCompleted: false,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return this.toResponse(created);
  }

  async getSummary(
    userId: number,
    reconciliationId: number,
  ): Promise<ReconciliationSummaryDto> {
    const reconciliation = await this.findRequiredReconciliation(
      userId,
      reconciliationId,
    );

    const grouped = await this.prisma.transaction.groupBy({
      by: ['status'],
      where: {
        accountId: reconciliation.accountId,
        userId: BigInt(userId),
      },
      _count: { _all: true },
    });

    let clearedCount = 0;
    let pendingCount = 0;
    for (const row of grouped) {
      if (row.status === (TransactionStatus.CLEARED as string)) {
        clearedCount = row._count._all;
      } else if (row.status === (TransactionStatus.PENDING as string)) {
        pendingCount = row._count._all;
      }
    }

    return {
      id: Number(reconciliation.id),
      accountId: Number(reconciliation.accountId),
      statementDate: reconciliation.statementDate.toISOString().split('T')[0],
      statementBalance: reconciliation.statementBalance.toNumber(),
      clearedBalance: reconciliation.clearedBalance.toNumber(),
      difference: reconciliation.difference.toNumber(),
      isCompleted: reconciliation.isCompleted ?? false,
      clearedCount,
      pendingCount,
    };
  }

  async complete(
    userId: number,
    reconciliationId: number,
  ): Promise<ReconciliationResponseDto> {
    const reconciliation = await this.findRequiredReconciliation(
      userId,
      reconciliationId,
    );

    if (!reconciliation.difference.equals(0)) {
      throw new BadRequestException('Reconciliation is not balanced');
    }

    const now = new Date();
    const updated = await this.prisma.reconciliation.update({
      where: { id: reconciliation.id },
      data: {
        isCompleted: true,
        completedAt: now,
        updatedAt: now,
      },
    });
    return this.toResponse(updated);
  }

  private isInflow(row: { type: string; transferIn: boolean | null }): boolean {
    const type = row.type as TransactionType;
    return (
      type === TransactionType.INCOME ||
      (type === TransactionType.TRANSFER && row.transferIn === true)
    );
  }

  private computeClearedBalance(
    startBalance: Prisma.Decimal,
    transactions: TransactionRow[],
  ): Prisma.Decimal {
    let balance = startBalance;
    for (const tx of transactions) {
      if (!this.isClearedStatus(tx.status)) continue;
      balance = this.isInflow(tx)
        ? balance.add(tx.amount)
        : balance.sub(tx.amount);
    }
    return balance;
  }

  private isClearedStatus(status: string): boolean {
    return status === (TransactionStatus.CLEARED as string);
  }

  private async findRequiredAccount(
    userId: number,
    accountId: number,
  ): Promise<{ id: bigint; startBalance: Prisma.Decimal | null }> {
    const account = await this.prisma.account.findFirst({
      where: { id: BigInt(accountId), userId: BigInt(userId) },
      select: { id: true, startBalance: true },
    });
    if (!account) {
      throw new NotFoundException('Account was not found');
    }
    return account;
  }

  private async findRequiredReconciliation(
    userId: number,
    reconciliationId: number,
  ): Promise<ReconciliationRow> {
    const reconciliation = await this.prisma.reconciliation.findFirst({
      where: { id: BigInt(reconciliationId), userId: BigInt(userId) },
    });
    if (!reconciliation) {
      throw new NotFoundException('Reconciliation was not found');
    }
    return reconciliation;
  }

  private toResponse(r: ReconciliationRow): ReconciliationResponseDto {
    return {
      id: Number(r.id),
      accountId: Number(r.accountId),
      statementDate: r.statementDate.toISOString().split('T')[0],
      statementBalance: r.statementBalance.toNumber(),
      clearedBalance: r.clearedBalance.toNumber(),
      difference: r.difference.toNumber(),
      isCompleted: r.isCompleted ?? false,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
