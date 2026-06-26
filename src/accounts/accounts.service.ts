import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountTemplate } from '../common/enums/account-template.enum';
import { AccountType } from '../common/enums/account-type.enum';
import type { AccountResponseDto } from './dto/account-response.dto';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';

type AccountWithCurrency = Prisma.AccountGetPayload<{
  include: { currency: true };
}>;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserAccounts(
    userId: number,
    includeInactive: boolean,
  ): Promise<AccountResponseDto[]> {
    await this.ensureUserExists(userId);
    const accounts = await this.prisma.account.findMany({
      where: {
        userId: BigInt(userId),
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { currency: true },
      orderBy: { name: 'asc' },
    });
    return accounts.map((a) => this.toAccountResponse(a));
  }

  async getAccount(
    userId: number,
    accountId: number,
  ): Promise<AccountResponseDto> {
    const account = await this.findRequiredAccount(userId, accountId);
    return this.toAccountResponse(account);
  }

  async createAccount(
    userId: number,
    dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    await this.ensureUserExists(userId);

    if (dto.currencyId !== undefined) {
      await this.ensureCurrencyExists(dto.currencyId);
    }

    const now = new Date();
    const account = await this.prisma.account.create({
      data: {
        userId: BigInt(userId),
        name: dto.name,
        institution: dto.institution ?? null,
        type: dto.type ?? AccountType.NO_TYPE,
        accountNumber: dto.accountNumber ?? null,
        currencyId:
          dto.currencyId !== undefined ? BigInt(dto.currencyId) : null,
        groupName: dto.groupName ?? null,
        startBalance: dto.startBalance ?? 0,
        notes: dto.notes ?? null,
        icon: dto.icon ?? null,
        isClosed: dto.closed ?? false,
        isActive: true,
        defaultTemplate: dto.defaultTemplate ?? AccountTemplate.NONE,
        excludeFromAccountSummary: dto.excludeFromAccountSummary ?? false,
        outlineIntoSummary: dto.outlineIntoSummary ?? false,
        excludeFromBudget: dto.excludeFromBudget ?? false,
        excludeFromAnyReports: dto.excludeFromAnyReports ?? false,
        overdraftAt: dto.overdraftAt ?? 0,
        maximumBalance: dto.maximumBalance ?? 0,
        checkbook1: dto.checkbook1 ?? 0,
        checkbook2: dto.checkbook2 ?? 0,
        createdAt: now,
        updatedAt: now,
      },
      include: { currency: true },
    });
    return this.toAccountResponse(account);
  }

  async updateAccount(
    userId: number,
    accountId: number,
    dto: UpdateAccountDto,
  ): Promise<AccountResponseDto> {
    await this.findRequiredAccount(userId, accountId);

    if (dto.currencyId !== undefined) {
      await this.ensureCurrencyExists(dto.currencyId);
    }

    const data: Prisma.AccountUpdateInput = { updatedAt: new Date() };

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.institution !== undefined) data.institution = dto.institution;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber;
    if (dto.currencyId !== undefined) {
      data.currency = { connect: { id: BigInt(dto.currencyId) } };
    }
    if (dto.groupName !== undefined) data.groupName = dto.groupName;
    if (dto.startBalance !== undefined) data.startBalance = dto.startBalance;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.closed !== undefined) data.isClosed = dto.closed;
    if (dto.active !== undefined) data.isActive = dto.active;
    if (dto.defaultTemplate !== undefined)
      data.defaultTemplate = dto.defaultTemplate;
    if (dto.excludeFromAccountSummary !== undefined)
      data.excludeFromAccountSummary = dto.excludeFromAccountSummary;
    if (dto.outlineIntoSummary !== undefined)
      data.outlineIntoSummary = dto.outlineIntoSummary;
    if (dto.excludeFromBudget !== undefined)
      data.excludeFromBudget = dto.excludeFromBudget;
    if (dto.excludeFromAnyReports !== undefined)
      data.excludeFromAnyReports = dto.excludeFromAnyReports;
    if (dto.overdraftAt !== undefined) data.overdraftAt = dto.overdraftAt;
    if (dto.maximumBalance !== undefined)
      data.maximumBalance = dto.maximumBalance;
    if (dto.checkbook1 !== undefined) data.checkbook1 = dto.checkbook1;
    if (dto.checkbook2 !== undefined) data.checkbook2 = dto.checkbook2;

    const updated = await this.prisma.account.update({
      where: { id: BigInt(accountId) },
      data,
      include: { currency: true },
    });
    return this.toAccountResponse(updated);
  }

  async deleteAccount(userId: number, accountId: number): Promise<void> {
    await this.findRequiredAccount(userId, accountId);
    await this.prisma.account.update({
      where: { id: BigInt(accountId) },
      data: { isActive: false, updatedAt: new Date() },
    });
  }

  private async findRequiredAccount(
    userId: number,
    accountId: number,
  ): Promise<AccountWithCurrency> {
    const account = await this.prisma.account.findFirst({
      where: { id: BigInt(accountId), userId: BigInt(userId) },
      include: { currency: true },
    });
    if (!account) {
      throw new NotFoundException('Account was not found');
    }
    return account;
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

  private async ensureCurrencyExists(currencyId: number): Promise<void> {
    const exists = await this.prisma.currency.findUnique({
      where: { id: BigInt(currencyId) },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Currency was not found');
    }
  }

  private toAccountResponse(account: AccountWithCurrency): AccountResponseDto {
    const c = account.currency;
    return {
      id: Number(account.id),
      name: account.name,
      institution: account.institution,
      type: (account.type as AccountType) ?? AccountType.NO_TYPE,
      accountNumber: account.accountNumber,
      currencyId: c ? Number(c.id) : null,
      currencyCode: c ? c.code : null,
      currencySymbol: c ? c.symbol : null,
      groupName: account.groupName,
      startBalance: account.startBalance?.toNumber() ?? 0,
      notes: account.notes,
      icon: account.icon,
      closed: account.isClosed ?? false,
      active: account.isActive ?? true,
      defaultTemplate:
        (account.defaultTemplate as AccountTemplate) ?? AccountTemplate.NONE,
      excludeFromAccountSummary: account.excludeFromAccountSummary ?? false,
      outlineIntoSummary: account.outlineIntoSummary ?? false,
      excludeFromBudget: account.excludeFromBudget ?? false,
      excludeFromAnyReports: account.excludeFromAnyReports ?? false,
      overdraftAt: account.overdraftAt?.toNumber() ?? 0,
      maximumBalance: account.maximumBalance?.toNumber() ?? 0,
      checkbook1: account.checkbook1 ?? 0,
      checkbook2: account.checkbook2 ?? 0,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
