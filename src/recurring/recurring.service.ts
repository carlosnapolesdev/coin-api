import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecurrenceFrequency, TransactionType } from '../common/enums';
import type { CreateRecurringDto } from './dto/create-recurring.dto';
import type { UpdateRecurringDto } from './dto/update-recurring.dto';
import type { RecurringResponseDto } from './dto/recurring-response.dto';

type RecurringWithRelations = Prisma.RecurringTransactionGetPayload<{
  include: { account: true; destinationAccount: true; userCategory: true };
}>;

export function computeNextRunDate(
  from: Date,
  frequency: RecurrenceFrequency,
  interval: number,
): Date {
  const result = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  switch (frequency) {
    case RecurrenceFrequency.DAILY:
      result.setUTCDate(result.getUTCDate() + interval);
      break;
    case RecurrenceFrequency.WEEKLY:
      result.setUTCDate(result.getUTCDate() + interval * 7);
      break;
    case RecurrenceFrequency.MONTHLY:
      result.setUTCMonth(result.getUTCMonth() + interval);
      break;
    case RecurrenceFrequency.YEARLY:
      result.setUTCFullYear(result.getUTCFullYear() + interval);
      break;
  }
  return result;
}

const INCLUDE = {
  account: true,
  destinationAccount: true,
  userCategory: true,
} satisfies Prisma.RecurringTransactionInclude;

@Injectable()
export class RecurringService {
  constructor(private readonly prisma: PrismaService) {}

  async listRecurring(userId: number): Promise<RecurringResponseDto[]> {
    const rows = await this.prisma.recurringTransaction.findMany({
      where: { userId: BigInt(userId) },
      include: INCLUDE,
      orderBy: [{ nextRunDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.toResponse(r));
  }

  async createRecurring(
    userId: number,
    dto: CreateRecurringDto,
  ): Promise<RecurringResponseDto> {
    await this.ensureAccount(userId, dto.accountId);

    if (dto.type === TransactionType.TRANSFER) {
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
      await this.ensureAccount(userId, dto.destinationAccountId);
    }

    if (dto.categoryId !== undefined) {
      await this.ensureCategory(userId, dto.categoryId);
    }

    const now = new Date();
    const startDate = new Date(dto.startDate);
    const created = await this.prisma.recurringTransaction.create({
      data: {
        userId: BigInt(userId),
        accountId: BigInt(dto.accountId),
        categoryId:
          dto.categoryId !== undefined ? BigInt(dto.categoryId) : null,
        destinationAccountId:
          dto.destinationAccountId !== undefined
            ? BigInt(dto.destinationAccountId)
            : null,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        frequency: dto.frequency,
        interval: dto.interval ?? 1,
        nextRunDate: startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        payee: dto.payee ?? null,
        memo: dto.memo ?? null,
        tags: dto.tags ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      include: INCLUDE,
    });
    return this.toResponse(created);
  }

  async updateRecurring(
    userId: number,
    id: number,
    dto: UpdateRecurringDto,
  ): Promise<RecurringResponseDto> {
    await this.findRequired(userId, id);

    if (dto.accountId !== undefined) {
      await this.ensureAccount(userId, dto.accountId);
    }
    if (dto.destinationAccountId !== undefined) {
      await this.ensureAccount(userId, dto.destinationAccountId);
    }
    if (dto.categoryId !== undefined) {
      await this.ensureCategory(userId, dto.categoryId);
    }

    const data: Prisma.RecurringTransactionUpdateInput = {
      updatedAt: new Date(),
    };
    if (dto.accountId !== undefined) {
      data.account = { connect: { id: BigInt(dto.accountId) } };
    }
    if (dto.destinationAccountId !== undefined) {
      data.destinationAccount = {
        connect: { id: BigInt(dto.destinationAccountId) },
      };
    }
    if (dto.categoryId !== undefined) {
      data.userCategory = { connect: { id: BigInt(dto.categoryId) } };
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.interval !== undefined) data.interval = dto.interval;
    if (dto.startDate !== undefined) data.nextRunDate = new Date(dto.startDate);
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.payee !== undefined) data.payee = dto.payee;
    if (dto.memo !== undefined) data.memo = dto.memo;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.recurringTransaction.update({
      where: { id: BigInt(id) },
      data,
      include: INCLUDE,
    });
    return this.toResponse(updated);
  }

  async deleteRecurring(userId: number, id: number): Promise<void> {
    await this.findRequired(userId, id);
    await this.prisma.recurringTransaction.delete({
      where: { id: BigInt(id) },
    });
  }

  private toResponse(r: RecurringWithRelations): RecurringResponseDto {
    return {
      id: Number(r.id),
      accountId: Number(r.accountId),
      accountName: r.account?.name ?? null,
      categoryId: r.categoryId ? Number(r.categoryId) : null,
      categoryName: r.userCategory?.name ?? null,
      destinationAccountId: r.destinationAccountId
        ? Number(r.destinationAccountId)
        : null,
      destinationAccountName: r.destinationAccount?.name ?? null,
      type: r.type as TransactionType,
      amount: r.amount.toNumber(),
      frequency: r.frequency as RecurrenceFrequency,
      interval: r.interval,
      nextRunDate: r.nextRunDate.toISOString().split('T')[0],
      lastRunDate: r.lastRunDate
        ? r.lastRunDate.toISOString().split('T')[0]
        : null,
      endDate: r.endDate ? r.endDate.toISOString().split('T')[0] : null,
      payee: r.payee,
      memo: r.memo,
      tags: r.tags,
      isActive: r.isActive,
    };
  }

  private async findRequired(
    userId: number,
    id: number,
  ): Promise<{ id: bigint }> {
    const row = await this.prisma.recurringTransaction.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId) },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Recurring transaction was not found');
    }
    return row;
  }

  private async ensureAccount(
    userId: number,
    accountId: number,
  ): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: { id: BigInt(accountId), userId: BigInt(userId) },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Account was not found');
    }
  }

  private async ensureCategory(
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
}
