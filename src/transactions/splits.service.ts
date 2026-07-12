import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '../common/enums';
import type { SplitResponseDto } from './dto/split-response.dto';
import type { TransactionResponseDto } from './dto/transaction-response.dto';
import type { SetSplitsDto } from './dto/set-splits.dto';

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: {
    account: true;
    userCategory: true;
    _count: { select: { attachments: true; splits: true } };
  };
}>;

const TX_RELATIONS_INCLUDE = {
  account: true,
  userCategory: true,
  _count: { select: { attachments: true, splits: true } },
};

@Injectable()
export class SplitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSplits(
    userId: number,
    transactionId: number,
  ): Promise<SplitResponseDto[]> {
    await this.findRequiredTransaction(userId, transactionId);
    const rows = await this.prisma.transactionSplit.findMany({
      where: { transactionId: BigInt(transactionId) },
      include: { category: { select: { name: true } } },
      orderBy: { id: 'asc' },
    });
    return rows.map((s) => ({
      id: Number(s.id),
      categoryId: Number(s.categoryId),
      categoryName: s.category?.name ?? '',
      amount: s.amount.toNumber(),
      memo: s.memo ?? null,
    }));
  }

  async setSplits(
    userId: number,
    transactionId: number,
    dto: SetSplitsDto,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.findRequiredTransaction(
      userId,
      transactionId,
    );

    if (
      transaction.transferGroupId ||
      transaction.type === (TransactionType.TRANSFER as string)
    ) {
      throw new BadRequestException('Splits are not supported for transfers');
    }

    const splits = dto.splits ?? [];

    if (splits.length > 0) {
      if (splits.length < 2) {
        throw new BadRequestException('Splits require at least two entries');
      }
      await this.validateSplits(userId, transaction.type, splits);
      this.assertSumEqualsAmount(
        transaction.amount,
        splits.map((s) => s.amount),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.transactionSplit.deleteMany({
        where: { transactionId: transaction.id },
      });
      if (splits.length > 0) {
        await tx.transactionSplit.createMany({
          data: splits.map((s) => ({
            transactionId: transaction.id,
            categoryId: BigInt(s.categoryId),
            amount: new Prisma.Decimal(s.amount),
            memo: s.memo ?? null,
          })),
        });
      }
      return tx.transaction.update({
        where: { id: transaction.id },
        data: {
          categoryId:
            splits.length > 0
              ? null
              : transaction.userCategory
                ? transaction.categoryId
                : null,
          updatedAt: new Date(),
        },
        include: TX_RELATIONS_INCLUDE,
      });
    });

    return this.toResponse(updated);
  }

  private async findRequiredTransaction(
    userId: number,
    transactionId: number,
  ): Promise<TransactionWithRelations> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: BigInt(transactionId), userId: BigInt(userId) },
      include: TX_RELATIONS_INCLUDE,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction was not found');
    }
    return transaction;
  }

  private async validateSplits(
    userId: number,
    txType: string,
    splits: { categoryId: number }[],
  ): Promise<void> {
    const ids = Array.from(new Set(splits.map((s) => s.categoryId)));
    const rows = await this.prisma.userCategory.findMany({
      where: { id: { in: ids.map((i) => BigInt(i)) }, userId: BigInt(userId) },
      select: { id: true, isActive: true, type: true },
    });
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    for (const s of splits) {
      const cat = byId.get(s.categoryId);
      if (!cat?.isActive) {
        throw new NotFoundException('Category was not found');
      }
      if (cat.type !== txType) {
        throw new BadRequestException(
          'Split categories must match the transaction type',
        );
      }
    }
  }

  private assertSumEqualsAmount(
    txAmount: Prisma.Decimal,
    splitAmounts: number[],
  ): void {
    const sum = splitAmounts.reduce(
      (acc, a) => acc.plus(new Prisma.Decimal(a)),
      new Prisma.Decimal(0),
    );
    if (!sum.equals(txAmount)) {
      throw new BadRequestException(
        'Splits must sum to the transaction amount',
      );
    }
  }

  private toResponse(t: TransactionWithRelations): TransactionResponseDto {
    const account = t.account;
    const category = t.userCategory;
    return {
      id: Number(t.id),
      accountId: account ? Number(account.id) : null,
      accountName: account?.name ?? null,
      categoryId: category ? Number(category.id) : null,
      categoryName: category?.name ?? null,
      type: t.type as TransactionResponseDto['type'],
      amount: t.amount.toNumber(),
      effectiveDate: t.effectiveDate.toISOString().split('T')[0],
      payee: t.payee,
      paymentMethod: t.paymentMethod,
      memo: t.memo,
      status: t.status as TransactionResponseDto['status'],
      tags: t.tags,
      transferAccountId: t.transferAccountId
        ? Number(t.transferAccountId)
        : null,
      transferIn: t.transferIn ?? null,
      exchangeRate: t.exchangeRate ? t.exchangeRate.toNumber() : null,
      balance: null,
      attachmentCount: t._count?.attachments ?? 0,
      splitCount: t._count?.splits ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
