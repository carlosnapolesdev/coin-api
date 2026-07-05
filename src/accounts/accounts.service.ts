import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyConversionService } from '../currencies/currency-conversion.service';
import { AccountTemplate } from '../common/enums/account-template.enum';
import { AccountType } from '../common/enums/account-type.enum';
import { TransactionType } from '../common/enums/transaction-type.enum';
import type { AccountResponseDto } from './dto/account-response.dto';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { NetWorthSummaryDto } from './dto/net-worth-summary.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';

type AccountWithCurrency = Prisma.AccountGetPayload<{
  include: { currency: true };
}>;

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyConversion: CurrencyConversionService,
  ) {}

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
    const balanceMap = await this.buildCurrentBalanceMap(accounts);
    return accounts.map((a) =>
      this.toAccountResponse(a, balanceMap.get(a.id)!),
    );
  }

  async getAccount(
    userId: number,
    accountId: number,
  ): Promise<AccountResponseDto> {
    const account = await this.findRequiredAccount(userId, accountId);
    if (!account.isActive) {
      throw new NotFoundException('Account was not found');
    }
    const currentBalance = await this.computeAccountBalance(
      account.id,
      account.startBalance,
    );
    return this.toAccountResponse(account, currentBalance);
  }

  async getNetWorthSummary(userId: number): Promise<NetWorthSummaryDto> {
    await this.ensureUserExists(userId);

    const accounts = await this.prisma.account.findMany({
      where: { userId: BigInt(userId), isActive: true },
      include: { currency: true },
    });
    const balanceMap = await this.buildCurrentBalanceMap(accounts);

    const groups = new Map<
      number | null,
      { code: string; symbol: string; net: number }
    >();
    for (const account of accounts) {
      const currencyId = account.currency ? Number(account.currency.id) : null;
      const balance = balanceMap.get(account.id) ?? new Prisma.Decimal(0);
      const group = groups.get(currencyId) ?? {
        code: account.currency?.code ?? 'N/A',
        symbol: account.currency?.symbol ?? '',
        net: 0,
      };
      group.net += balance.toNumber();
      groups.set(currencyId, group);
    }

    const rates = await this.currencyConversion.loadRates(userId);
    let baseCurrencyCode: string | null = null;
    if (rates.baseCurrencyId !== null) {
      const baseCurrency = await this.prisma.currency.findUnique({
        where: { id: BigInt(rates.baseCurrencyId) },
      });
      baseCurrencyCode = baseCurrency?.code ?? null;
    }

    let totalInBase = 0;
    const unconvertibleCurrencies: string[] = [];
    const byCurrency = Array.from(groups.entries()).map(
      ([currencyId, group]) => {
        const netInBase =
          currencyId === null
            ? null
            : this.currencyConversion.convertToBase(
                group.net,
                currencyId,
                rates,
              );
        if (netInBase === null) {
          if (currencyId !== null) unconvertibleCurrencies.push(group.code);
        } else {
          totalInBase += netInBase;
        }
        return {
          code: group.code,
          symbol: group.symbol,
          net: group.net,
          netInBase,
        };
      },
    );

    return {
      baseCurrencyCode,
      totalInBase,
      byCurrency,
      unconvertibleCurrencies,
    };
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
    const currentBalance = await this.computeAccountBalance(
      account.id,
      account.startBalance,
    );
    return this.toAccountResponse(account, currentBalance);
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
    const currentBalance = await this.computeAccountBalance(
      updated.id,
      updated.startBalance,
    );
    return this.toAccountResponse(updated, currentBalance);
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

  private async buildCurrentBalanceMap(
    accounts: AccountWithCurrency[],
  ): Promise<Map<bigint, Prisma.Decimal>> {
    const map = new Map<bigint, Prisma.Decimal>();
    for (const a of accounts) {
      map.set(a.id, a.startBalance ?? new Prisma.Decimal(0));
    }

    if (accounts.length === 0) return map;

    const txSums = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { accountId: { in: accounts.map((a) => a.id) } },
      _sum: { amount: true },
    });

    for (const row of txSums) {
      const current = map.get(row.accountId) ?? new Prisma.Decimal(0);
      const amt = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.type === (TransactionType.INCOME as string)) {
        map.set(row.accountId, current.add(amt));
      } else {
        map.set(row.accountId, current.sub(amt));
      }
    }

    return map;
  }

  private async computeAccountBalance(
    accountId: bigint,
    startBalance: Prisma.Decimal | null,
  ): Promise<Prisma.Decimal> {
    const txSums = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { accountId },
      _sum: { amount: true },
    });

    let balance = startBalance ?? new Prisma.Decimal(0);
    for (const row of txSums) {
      const amt = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.type === (TransactionType.INCOME as string)) {
        balance = balance.add(amt);
      } else {
        balance = balance.sub(amt);
      }
    }

    return balance;
  }

  private toAccountResponse(
    account: AccountWithCurrency,
    currentBalance: Prisma.Decimal,
  ): AccountResponseDto {
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
      currentBalance: currentBalance.toNumber(),
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
