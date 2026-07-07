import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '../common/enums';
import { CurrencyConversionService } from '../currencies/currency-conversion.service';
import { AccountsService } from './accounts.service';

const makeAccount = (
  id: bigint,
  opts: {
    startBalance?: number | null;
    isActive?: boolean;
    isClosed?: boolean;
  } = {},
) => ({
  id,
  userId: BigInt(1),
  name: `Account ${id}`,
  institution: null,
  type: 'BANK',
  accountNumber: null,
  currencyId: null,
  groupName: null,
  startBalance:
    opts.startBalance !== undefined && opts.startBalance !== null
      ? new Prisma.Decimal(opts.startBalance)
      : null,
  notes: null,
  icon: null,
  isClosed: opts.isClosed ?? false,
  isActive: opts.isActive ?? true,
  defaultTemplate: 'NONE',
  excludeFromAccountSummary: false,
  outlineIntoSummary: false,
  excludeFromBudget: false,
  excludeFromAnyReports: false,
  overdraftAt: new Prisma.Decimal(0),
  maximumBalance: new Prisma.Decimal(0),
  checkbook1: 0,
  checkbook2: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  currency: null,
});

describe('AccountsService — balance calculation', () => {
  let service: AccountsService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    account: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    currency: { findUnique: jest.fn() },
    transaction: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConversion = {
    loadRates: jest.fn(),
    convertToBase: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CurrencyConversionService, useValue: mockConversion },
      ],
    }).compile();
    service = module.get(AccountsService);

    mockPrisma.user.findUnique.mockResolvedValue({ id: BigInt(1) });
    mockConversion.loadRates.mockResolvedValue({
      baseCurrencyId: null,
      rates: {},
    });
    mockConversion.convertToBase.mockReturnValue(null);
  });

  describe('getUserAccounts', () => {
    it('returns zero for an account with no transactions', async () => {
      const account = makeAccount(BigInt(1), { startBalance: 0 });
      mockPrisma.account.findMany.mockResolvedValue([account]);
      mockPrisma.transaction.groupBy.mockResolvedValue([]);

      const result = await service.getUserAccounts(1, false);
      expect(result).toHaveLength(1);
      expect(result[0].currentBalance).toBe(0);
    });

    it('treats an incoming transfer leg as an inflow', async () => {
      const usd = makeAccount(BigInt(1), { startBalance: 0 });
      const uyu = makeAccount(BigInt(2), { startBalance: 0 });
      mockPrisma.account.findMany.mockResolvedValue([usd, uyu]);

      mockPrisma.transaction.groupBy.mockImplementation((args: any) => {
        if (args.by.includes('transferIn')) {
          return Promise.resolve([
            {
              accountId: BigInt(1),
              type: TransactionType.TRANSFER,
              transferIn: false,
              _sum: { amount: new Prisma.Decimal(100) },
            },
            {
              accountId: BigInt(2),
              type: TransactionType.TRANSFER,
              transferIn: true,
              _sum: { amount: new Prisma.Decimal(4000) },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getUserAccounts(1, false);
      const usdAccount = result.find((a) => a.id === 1)!;
      const uyuAccount = result.find((a) => a.id === 2)!;

      expect(uyuAccount.currentBalance).toBe(4000);
      expect(usdAccount.currentBalance).toBe(-100);
    });

    it('adds INCOME to the current balance', async () => {
      const account = makeAccount(BigInt(1), { startBalance: 0 });
      mockPrisma.account.findMany.mockResolvedValue([account]);
      mockPrisma.transaction.groupBy.mockResolvedValue([
        {
          accountId: BigInt(1),
          type: TransactionType.INCOME,
          transferIn: null,
          _sum: { amount: new Prisma.Decimal(500) },
        },
      ]);

      const result = await service.getUserAccounts(1, false);
      expect(result[0].currentBalance).toBe(500);
    });

    it('subtracts EXPENSE from the current balance', async () => {
      const account = makeAccount(BigInt(1), { startBalance: 100 });
      mockPrisma.account.findMany.mockResolvedValue([account]);
      mockPrisma.transaction.groupBy.mockResolvedValue([
        {
          accountId: BigInt(1),
          type: TransactionType.EXPENSE,
          transferIn: null,
          _sum: { amount: new Prisma.Decimal(40) },
        },
      ]);

      const result = await service.getUserAccounts(1, false);
      expect(result[0].currentBalance).toBe(60);
    });
  });

  describe('getAccount', () => {
    it('returns the current balance reflecting an incoming transfer', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(2), { startBalance: 0 }),
      );
      mockPrisma.transaction.groupBy.mockImplementation((args: any) => {
        if (args.by.includes('transferIn')) {
          return Promise.resolve([
            {
              accountId: BigInt(2),
              type: TransactionType.TRANSFER,
              transferIn: true,
              _sum: { amount: new Prisma.Decimal(4000) },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getAccount(1, 2);
      expect(result.currentBalance).toBe(4000);
    });
  });
});
