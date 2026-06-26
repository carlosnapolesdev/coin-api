import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionStatus, TransactionType } from '../common/enums';
import type { TransactionResponseDto } from './dto/transaction-response.dto';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { account: true; userCategory: true };
}>;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserTransactions(
    userId: number,
    accountId?: number,
    from?: string,
    to?: string,
  ): Promise<TransactionResponseDto[]> {
    await this.ensureUserExists(userId);

    if (accountId !== undefined) {
      const account = await this.findRequiredAccount(userId, accountId);
      const transactions = await this.prisma.transaction.findMany({
        where: { userId: BigInt(userId), accountId: BigInt(accountId) },
        include: { account: true, userCategory: true },
        orderBy: [{ effectiveDate: 'asc' }, { id: 'asc' }],
      });
      return this.buildResponsesWithRunningBalance(
        transactions,
        account.startBalance,
      );
    }

    if (from !== undefined && to !== undefined) {
      const transactions = await this.prisma.transaction.findMany({
        where: {
          userId: BigInt(userId),
          effectiveDate: { gte: new Date(from), lte: new Date(to) },
        },
        include: { account: true, userCategory: true },
        orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
      });
      return transactions.map((t) => this.toResponse(t, null));
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { userId: BigInt(userId) },
      include: { account: true, userCategory: true },
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    });
    return transactions.map((t) => this.toResponse(t, null));
  }

  async getTransaction(
    userId: number,
    transactionId: number,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.findRequiredTransaction(
      userId,
      transactionId,
    );
    return this.toResponse(transaction, null);
  }

  async createTransaction(
    userId: number,
    dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    await this.ensureUserExists(userId);
    await this.findRequiredAccount(userId, dto.accountId);

    if (dto.categoryId !== undefined) {
      await this.findRequiredCategory(userId, dto.categoryId);
    }

    const now = new Date();
    const transaction = await this.prisma.transaction.create({
      data: {
        userId: BigInt(userId),
        accountId: BigInt(dto.accountId),
        categoryId:
          dto.categoryId !== undefined ? BigInt(dto.categoryId) : null,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        effectiveDate: new Date(dto.effectiveDate),
        payee: dto.payee ?? null,
        paymentMethod: dto.paymentMethod ?? null,
        memo: dto.memo ?? null,
        status: dto.status ?? TransactionStatus.CLEARED,
        tags: dto.tags ?? null,
        createdAt: now,
        updatedAt: now,
      },
      include: { account: true, userCategory: true },
    });
    return this.toResponse(transaction, null);
  }

  async updateTransaction(
    userId: number,
    transactionId: number,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    await this.findRequiredTransaction(userId, transactionId);

    if (dto.accountId !== undefined) {
      await this.findRequiredAccount(userId, dto.accountId);
    }
    if (dto.categoryId !== undefined) {
      await this.findRequiredCategory(userId, dto.categoryId);
    }

    const data: Prisma.TransactionUpdateInput = { updatedAt: new Date() };

    if (dto.accountId !== undefined) {
      data.account = { connect: { id: BigInt(dto.accountId) } };
    }
    if (dto.categoryId !== undefined) {
      data.userCategory = { connect: { id: BigInt(dto.categoryId) } };
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.effectiveDate !== undefined)
      data.effectiveDate = new Date(dto.effectiveDate);
    if (dto.payee !== undefined) data.payee = dto.payee;
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.memo !== undefined) data.memo = dto.memo;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.tags !== undefined) data.tags = dto.tags;

    const updated = await this.prisma.transaction.update({
      where: { id: BigInt(transactionId) },
      data,
      include: { account: true, userCategory: true },
    });
    return this.toResponse(updated, null);
  }

  async deleteTransaction(
    userId: number,
    transactionId: number,
  ): Promise<void> {
    await this.findRequiredTransaction(userId, transactionId);
    await this.prisma.transaction.delete({
      where: { id: BigInt(transactionId) },
    });
  }

  private buildResponsesWithRunningBalance(
    transactions: TransactionWithRelations[],
    startBalance: Prisma.Decimal | null,
  ): TransactionResponseDto[] {
    let running = startBalance ?? new Prisma.Decimal(0);
    const result: TransactionResponseDto[] = [];

    for (const t of transactions) {
      if (t.type === (TransactionType.INCOME as string)) {
        running = running.add(t.amount);
      } else {
        running = running.sub(t.amount);
      }
      result.push(this.toResponse(t, running));
    }

    return result.reverse();
  }

  private toResponse(
    t: TransactionWithRelations,
    balance: Prisma.Decimal | null,
  ): TransactionResponseDto {
    const account = t.account;
    const category = t.userCategory;
    return {
      id: Number(t.id),
      accountId: account ? Number(account.id) : null,
      accountName: account?.name ?? null,
      categoryId: category ? Number(category.id) : null,
      categoryName: category?.name ?? null,
      type: t.type as TransactionType,
      amount: t.amount.toNumber(),
      effectiveDate: t.effectiveDate.toISOString().split('T')[0],
      payee: t.payee,
      paymentMethod: t.paymentMethod,
      memo: t.memo,
      status: (t.status as TransactionStatus) ?? TransactionStatus.CLEARED,
      tags: t.tags,
      balance: balance !== null ? balance.toNumber() : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private async findRequiredTransaction(
    userId: number,
    transactionId: number,
  ): Promise<TransactionWithRelations> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: BigInt(transactionId), userId: BigInt(userId) },
      include: { account: true, userCategory: true },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction was not found');
    }
    return transaction;
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

  private async findRequiredCategory(
    userId: number,
    categoryId: number,
  ): Promise<void> {
    const category = await this.prisma.userCategory.findFirst({
      where: { id: BigInt(categoryId), userId: BigInt(userId) },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category was not found');
    }
  }

  private async ensureUserExists(userId: number): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('User was not found');
    }
  }
}
