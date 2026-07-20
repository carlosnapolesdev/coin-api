import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { escapeCsvFormula } from '../common/csv/escape-formula';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import { TransactionStatus, TransactionType } from '../common/enums';
import type { TransactionResponseDto } from './dto/transaction-response.dto';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';
import type { QueryTransactionsDto } from './dto/query-transactions.dto';
import type { PaginatedResponse } from '../common/dto';

const EXPORT_COLUMNS = [
  'date',
  'account',
  'category',
  'type',
  'amount',
  'payee',
  'paymentMethod',
  'status',
  'tags',
  'memo',
] as const;

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
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tags: TagsService,
  ) {}

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
        include: TX_RELATIONS_INCLUDE,
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
        include: TX_RELATIONS_INCLUDE,
        orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
      });
      return transactions.map((t) => this.toResponse(t, null));
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { userId: BigInt(userId) },
      include: TX_RELATIONS_INCLUDE,
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    });
    return transactions.map((t) => this.toResponse(t, null));
  }

  async searchTransactions(
    userId: number,
    query: QueryTransactionsDto,
  ): Promise<PaginatedResponse<TransactionResponseDto>> {
    await this.ensureUserExists(userId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.buildSearchWhere(userId, query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        include: TX_RELATIONS_INCLUDE,
        orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map((t) => this.toResponse(t, null)),
      total,
      page,
      pageSize,
    };
  }

  async exportCsv(
    userId: number,
    query: QueryTransactionsDto,
  ): Promise<string> {
    await this.ensureUserExists(userId);

    const where = this.buildSearchWhere(userId, query);
    const rows = await this.prisma.transaction.findMany({
      where,
      include: { account: true, userCategory: true },
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    });

    // Only the free-text columns are escaped. `date`, `type`, `amount` and
    // `status` are produced here from typed values, never from user input, and
    // quoting them would break the spreadsheet's number and date parsing.
    const records = rows.map((t) => ({
      date: t.effectiveDate.toISOString().split('T')[0],
      account: escapeCsvFormula(t.account.name),
      category: escapeCsvFormula(t.userCategory?.name ?? ''),
      type: t.type,
      amount: t.amount.toNumber(),
      payee: escapeCsvFormula(t.payee ?? ''),
      paymentMethod: escapeCsvFormula(t.paymentMethod ?? ''),
      status: t.status,
      tags: escapeCsvFormula(t.tags ?? ''),
      memo: escapeCsvFormula(t.memo ?? ''),
    }));

    return stringify(records, { header: true, columns: EXPORT_COLUMNS });
  }

  private buildSearchWhere(
    userId: number,
    query: QueryTransactionsDto,
  ): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = { userId: BigInt(userId) };
    if (query.accountId !== undefined)
      where.accountId = BigInt(query.accountId);
    if (query.categoryId !== undefined)
      where.categoryId = BigInt(query.categoryId);
    if (query.type !== undefined) where.type = query.type;
    if (query.status !== undefined) where.status = query.status;
    if (query.from !== undefined || query.to !== undefined) {
      where.effectiveDate = {};
      if (query.from) where.effectiveDate.gte = new Date(query.from);
      if (query.to) where.effectiveDate.lte = new Date(query.to);
    }
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.amount = {};
      if (query.minAmount !== undefined)
        where.amount.gte = new Prisma.Decimal(query.minAmount);
      if (query.maxAmount !== undefined)
        where.amount.lte = new Prisma.Decimal(query.maxAmount);
    }
    if (query.q) {
      const q = query.q;
      where.OR = [
        { payee: { contains: q, mode: 'insensitive' } },
        { memo: { contains: q, mode: 'insensitive' } },
        { tags: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
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
    const sourceAccount = await this.findRequiredAccount(
      userId,
      dto.accountId,
      true,
    );

    if (dto.type === TransactionType.TRANSFER) {
      return this.createTransfer(userId, dto, sourceAccount);
    }

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
      include: TX_RELATIONS_INCLUDE,
    });
    await this.tags.syncTags(userId, dto.tags);
    return this.toResponse(transaction, null);
  }

  private async createTransfer(
    userId: number,
    dto: CreateTransactionDto,
    sourceAccount: {
      id: bigint;
      startBalance: Prisma.Decimal | null;
      currencyId: bigint | null;
    },
  ): Promise<TransactionResponseDto> {
    if (dto.destinationAccountId === undefined) {
      throw new BadRequestException(
        'Destination account is required for a transfer',
      );
    }
    if (dto.destinationAccountId === dto.accountId) {
      throw new BadRequestException(
        'Source and destination accounts must differ',
      );
    }
    const destinationAccount = await this.findRequiredAccount(
      userId,
      dto.destinationAccountId,
      true,
    );

    const needsConversion =
      sourceAccount.currencyId !== null &&
      destinationAccount.currencyId !== null &&
      sourceAccount.currencyId !== destinationAccount.currencyId;

    let exchangeRate: Prisma.Decimal | null = null;
    let destinationAmount = new Prisma.Decimal(dto.amount);

    if (needsConversion) {
      if (dto.exchangeRate === undefined || dto.exchangeRate <= 0) {
        throw new BadRequestException(
          'Exchange rate is required for cross-currency transfers',
        );
      }
      exchangeRate = new Prisma.Decimal(dto.exchangeRate);
      destinationAmount = new Prisma.Decimal(dto.amount)
        .mul(exchangeRate)
        .toDecimalPlaces(2);
    }

    const groupId = randomUUID();
    const now = new Date();
    const shared = {
      userId: BigInt(userId),
      categoryId: null,
      type: TransactionType.TRANSFER,
      effectiveDate: new Date(dto.effectiveDate),
      payee: dto.payee ?? null,
      paymentMethod: dto.paymentMethod ?? null,
      memo: dto.memo ?? null,
      status: dto.status ?? TransactionStatus.CLEARED,
      tags: dto.tags ?? null,
      transferGroupId: groupId,
      exchangeRate,
      createdAt: now,
      updatedAt: now,
    };

    const source = await this.prisma.$transaction(async (tx) => {
      const out = await tx.transaction.create({
        data: {
          ...shared,
          accountId: BigInt(dto.accountId),
          amount: new Prisma.Decimal(dto.amount),
          transferAccountId: BigInt(dto.destinationAccountId as number),
          transferIn: false,
        },
        include: TX_RELATIONS_INCLUDE,
      });
      await tx.transaction.create({
        data: {
          ...shared,
          accountId: BigInt(dto.destinationAccountId as number),
          amount: destinationAmount,
          transferAccountId: BigInt(dto.accountId),
          transferIn: true,
        },
        include: TX_RELATIONS_INCLUDE,
      });
      return out;
    });

    await this.tags.syncTags(userId, dto.tags);
    return this.toResponse(source, null);
  }

  async updateTransaction(
    userId: number,
    transactionId: number,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const existing = await this.findRequiredTransaction(userId, transactionId);

    if (existing.transferGroupId) {
      return this.updateTransfer(userId, existing, dto);
    }

    if ((existing._count?.splits ?? 0) > 0) {
      if (
        dto.amount !== undefined ||
        dto.categoryId !== undefined ||
        dto.type !== undefined
      ) {
        throw new BadRequestException(
          'Remove splits before changing amount, category or type',
        );
      }
    }

    if (dto.accountId !== undefined) {
      await this.findRequiredAccount(userId, dto.accountId, true);
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
      include: TX_RELATIONS_INCLUDE,
    });
    if (dto.tags !== undefined) {
      await this.tags.syncTags(userId, dto.tags);
    }
    return this.toResponse(updated, null);
  }

  private async updateTransfer(
    userId: number,
    existing: TransactionWithRelations,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    if (dto.accountId !== undefined || dto.destinationAccountId !== undefined) {
      throw new BadRequestException(
        'Changing accounts on an existing transfer is not supported',
      );
    }

    const counterpart = await this.prisma.transaction.findFirst({
      where: {
        transferGroupId: existing.transferGroupId,
        userId: BigInt(userId),
        id: { not: existing.id },
      },
      include: TX_RELATIONS_INCLUDE,
    });
    if (!counterpart) {
      throw new NotFoundException('Transfer counterpart was not found');
    }

    const sourceLeg = existing.transferIn ? counterpart : existing;
    const destinationLeg = existing.transferIn ? existing : counterpart;

    const newAmount = dto.amount ?? sourceLeg.amount.toNumber();
    const sourceCurrencyId = sourceLeg.account.currencyId;
    const destinationCurrencyId = destinationLeg.account.currencyId;
    const needsConversion =
      sourceCurrencyId !== null &&
      destinationCurrencyId !== null &&
      sourceCurrencyId !== destinationCurrencyId;

    let exchangeRate: Prisma.Decimal | null = null;
    let destinationAmount = new Prisma.Decimal(newAmount);

    if (needsConversion) {
      const rate = dto.exchangeRate ?? sourceLeg.exchangeRate?.toNumber();
      if (rate === undefined || rate <= 0) {
        throw new BadRequestException(
          'Exchange rate is required for cross-currency transfers',
        );
      }
      exchangeRate = new Prisma.Decimal(rate);
      destinationAmount = new Prisma.Decimal(newAmount)
        .mul(exchangeRate)
        .toDecimalPlaces(2);
    }

    const shared: Prisma.TransactionUpdateInput = {
      updatedAt: new Date(),
      exchangeRate,
    };
    if (dto.effectiveDate !== undefined)
      shared.effectiveDate = new Date(dto.effectiveDate);
    if (dto.payee !== undefined) shared.payee = dto.payee;
    if (dto.paymentMethod !== undefined)
      shared.paymentMethod = dto.paymentMethod;
    if (dto.memo !== undefined) shared.memo = dto.memo;
    if (dto.status !== undefined) shared.status = dto.status;
    if (dto.tags !== undefined) shared.tags = dto.tags;

    const [updatedSourceLeg, updatedDestinationLeg] =
      await this.prisma.$transaction(async (tx) => {
        const updatedSrc = await tx.transaction.update({
          where: { id: sourceLeg.id },
          data: { ...shared, amount: new Prisma.Decimal(newAmount) },
          include: TX_RELATIONS_INCLUDE,
        });
        const updatedDst = await tx.transaction.update({
          where: { id: destinationLeg.id },
          data: { ...shared, amount: destinationAmount },
          include: TX_RELATIONS_INCLUDE,
        });
        return [updatedSrc, updatedDst];
      });

    if (dto.tags !== undefined) {
      await this.tags.syncTags(userId, dto.tags);
    }

    const requested = existing.transferIn
      ? updatedDestinationLeg
      : updatedSourceLeg;
    return this.toResponse(requested, null);
  }

  async deleteTransaction(
    userId: number,
    transactionId: number,
  ): Promise<void> {
    const transaction = await this.findRequiredTransaction(
      userId,
      transactionId,
    );
    if (transaction.transferGroupId) {
      await this.prisma.transaction.deleteMany({
        where: {
          transferGroupId: transaction.transferGroupId,
          userId: BigInt(userId),
        },
      });
      return;
    }
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
      const isInflow =
        t.type === (TransactionType.INCOME as string) ||
        (t.type === (TransactionType.TRANSFER as string) &&
          t.transferIn === true);
      running = isInflow ? running.add(t.amount) : running.sub(t.amount);
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
      transferAccountId: t.transferAccountId
        ? Number(t.transferAccountId)
        : null,
      transferIn: t.transferIn ?? null,
      exchangeRate: t.exchangeRate ? t.exchangeRate.toNumber() : null,
      balance: balance !== null ? balance.toNumber() : null,
      attachmentCount: t._count?.attachments ?? 0,
      splitCount: t._count?.splits ?? 0,
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
      include: TX_RELATIONS_INCLUDE,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction was not found');
    }
    return transaction;
  }

  private async findRequiredAccount(
    userId: number,
    accountId: number,
    requireActive = false,
  ): Promise<{
    id: bigint;
    startBalance: Prisma.Decimal | null;
    currencyId: bigint | null;
  }> {
    const account = await this.prisma.account.findFirst({
      where: { id: BigInt(accountId), userId: BigInt(userId) },
      select: {
        id: true,
        startBalance: true,
        isActive: true,
        currencyId: true,
      },
    });
    if (!account || (requireActive && !account.isActive)) {
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
      select: { id: true, isActive: true },
    });
    if (!category?.isActive) {
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
