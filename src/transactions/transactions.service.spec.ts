import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionStatus, TransactionType } from '../common/enums';
import { TransactionsService } from './transactions.service';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';

const makeAccount = (
  id: bigint,
  opts: { startBalance?: number | null } = {},
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
  isClosed: false,
  isActive: true,
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

const makeTransaction = (
  id: bigint,
  opts: {
    type?: TransactionType;
    amount?: number;
    effectiveDate?: string;
    categoryId?: bigint | null;
    accountId?: bigint;
  } = {},
) => {
  const accountId = opts.accountId ?? BigInt(1);
  return {
    id,
    userId: BigInt(1),
    accountId,
    categoryId: opts.categoryId ?? null,
    type: opts.type ?? TransactionType.EXPENSE,
    amount: new Prisma.Decimal(opts.amount ?? 100),
    effectiveDate: new Date(opts.effectiveDate ?? '2024-01-15T00:00:00.000Z'),
    payee: null,
    paymentMethod: null,
    memo: null,
    status: TransactionStatus.CLEARED,
    tags: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    account: makeAccount(accountId),
    userCategory:
      opts.categoryId !== undefined && opts.categoryId !== null
        ? {
            id: opts.categoryId,
            userId: BigInt(1),
            name: `Category ${opts.categoryId}`,
            type: 'EXPENSE',
            icon: null,
            parentId: null,
            isActive: true,
            isCustom: false,
            sourceCategoryId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null,
  };
};

describe('TransactionsService', () => {
  let service: TransactionsService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    account: { findFirst: jest.fn() },
    userCategory: { findFirst: jest.fn() },
    transaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    jest.clearAllMocks();
  });

  const userExists = () =>
    mockPrisma.user.findUnique.mockResolvedValue({ id: BigInt(1) });

  describe('getUserTransactions — running balance', () => {
    it('returns empty array when there are no transactions', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 0 }),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.getUserTransactions(1, 1);

      expect(result).toEqual([]);
    });

    it('accumulates INCOME as addition to running balance', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 100 }),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1), {
          type: TransactionType.INCOME,
          amount: 200,
        }),
      ]);

      const result = await service.getUserTransactions(1, 1);

      expect(result).toHaveLength(1);
      expect(result[0].balance).toBe(300);
    });

    it('accumulates EXPENSE as subtraction from running balance', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 500 }),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1), {
          type: TransactionType.EXPENSE,
          amount: 150,
        }),
      ]);

      const result = await service.getUserTransactions(1, 1);

      expect(result[0].balance).toBe(350);
    });

    it('accumulates TRANSFER as subtraction from running balance', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 500 }),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1), {
          type: TransactionType.TRANSFER,
          amount: 50,
        }),
      ]);

      const result = await service.getUserTransactions(1, 1);

      expect(result[0].balance).toBe(450);
    });

    it('adds the incoming transfer leg to the running balance', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(2), { startBalance: 100 }),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          ...makeTransaction(BigInt(11), {
            type: TransactionType.TRANSFER,
            amount: 50,
            accountId: BigInt(2),
          }),
          transferIn: true,
        },
      ]);

      const result = await service.getUserTransactions(1, 2);

      expect(result[0].balance).toBe(150);
    });

    it('returns transactions in descending order with correct per-transaction balance', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 0 }),
      );
      // DB returns ASC order: t1 first, t3 last
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1), {
          type: TransactionType.INCOME,
          amount: 100,
          effectiveDate: '2024-01-01T00:00:00.000Z',
        }),
        makeTransaction(BigInt(2), {
          type: TransactionType.EXPENSE,
          amount: 40,
          effectiveDate: '2024-01-02T00:00:00.000Z',
        }),
        makeTransaction(BigInt(3), {
          type: TransactionType.INCOME,
          amount: 200,
          effectiveDate: '2024-01-03T00:00:00.000Z',
        }),
      ]);

      const result = await service.getUserTransactions(1, 1);

      expect(result).toHaveLength(3);
      // Returned DESC: t3 first
      expect(result[0].id).toBe(3);
      expect(result[0].balance).toBe(260); // 0+100-40+200
      expect(result[1].id).toBe(2);
      expect(result[1].balance).toBe(60); // 0+100-40
      expect(result[2].id).toBe(1);
      expect(result[2].balance).toBe(100); // 0+100
    });

    it('uses startBalance as the initial accumulator', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 1000 }),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1), {
          type: TransactionType.EXPENSE,
          amount: 300,
        }),
      ]);

      const result = await service.getUserTransactions(1, 1);

      expect(result[0].balance).toBe(700);
    });

    it('treats null startBalance as zero', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: null }),
      );
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1), {
          type: TransactionType.INCOME,
          amount: 50,
        }),
      ]);

      const result = await service.getUserTransactions(1, 1);

      expect(result[0].balance).toBe(50);
    });

    it('returns null balance when no accountId filter is used', async () => {
      userExists();
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1)),
      ]);

      const result = await service.getUserTransactions(1);

      expect(result[0].balance).toBeNull();
    });

    it('returns null balance for date range queries', async () => {
      userExists();
      mockPrisma.transaction.findMany.mockResolvedValue([
        makeTransaction(BigInt(1)),
      ]);

      const result = await service.getUserTransactions(
        1,
        undefined,
        '2024-01-01',
        '2024-01-31',
      );

      expect(result[0].balance).toBeNull();
    });

    it('throws NotFoundException when accountId filter references a foreign account', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(service.getUserTransactions(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTransaction', () => {
    it('returns the transaction without a balance', async () => {
      const tx = makeTransaction(BigInt(5));
      mockPrisma.transaction.findFirst.mockResolvedValue(tx);

      const result = await service.getTransaction(1, 5);

      expect(result.id).toBe(5);
      expect(result.balance).toBeNull();
    });

    it('throws NotFoundException when transaction does not belong to user', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.getTransaction(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createTransaction', () => {
    const dto: CreateTransactionDto = {
      accountId: 1,
      type: TransactionType.EXPENSE,
      amount: 75.5,
      effectiveDate: '2024-03-10',
    };

    it('creates a transaction and returns the response', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 0 }),
      );
      const created = makeTransaction(BigInt(10), {
        type: TransactionType.EXPENSE,
        amount: 75.5,
        effectiveDate: '2024-03-10T00:00:00.000Z',
      });
      mockPrisma.transaction.create.mockResolvedValue(created);

      const result = await service.createTransaction(1, dto);

      expect(result.id).toBe(10);
      expect(result.amount).toBe(75.5);
      expect(result.balance).toBeNull();
    });

    it('defaults status to CLEARED when not provided', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 0 }),
      );
      mockPrisma.transaction.create.mockResolvedValue(
        makeTransaction(BigInt(1)),
      );

      await service.createTransaction(1, dto);

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.CLEARED,
          }),
        }),
      );
    });

    it('throws NotFoundException when account does not belong to user', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(service.createTransaction(1, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when category does not belong to user', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 0 }),
      );
      mockPrisma.userCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.createTransaction(1, { ...dto, categoryId: 99 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTransaction — TRANSFER', () => {
    const transferDto: CreateTransactionDto = {
      accountId: 1,
      destinationAccountId: 2,
      type: TransactionType.TRANSFER,
      amount: 50,
      effectiveDate: '2024-03-10',
    };

    it('creates a linked pair for a TRANSFER and returns the source leg', async () => {
      userExists();
      mockPrisma.account.findFirst
        .mockResolvedValueOnce(makeAccount(BigInt(1), { startBalance: 0 }))
        .mockResolvedValueOnce(makeAccount(BigInt(2), { startBalance: 0 }));
      const sourceLeg = makeTransaction(BigInt(10), {
        type: TransactionType.TRANSFER,
        amount: 50,
        accountId: BigInt(1),
      });
      const destinationLeg = makeTransaction(BigInt(11), {
        type: TransactionType.TRANSFER,
        amount: 50,
        accountId: BigInt(2),
      });
      mockPrisma.$transaction.mockImplementation((cb) => cb(mockPrisma));
      mockPrisma.transaction.create
        .mockResolvedValueOnce(sourceLeg)
        .mockResolvedValueOnce(destinationLeg);

      const result = await service.createTransaction(1, transferDto);

      expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.transaction.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          accountId: BigInt(1),
          transferAccountId: BigInt(2),
          transferIn: false,
        }),
      );
      expect(mockPrisma.transaction.create.mock.calls[1][0].data).toEqual(
        expect.objectContaining({
          accountId: BigInt(2),
          transferAccountId: BigInt(1),
          transferIn: true,
        }),
      );
      expect(
        mockPrisma.transaction.create.mock.calls[0][0].data.transferGroupId,
      ).toBe(
        mockPrisma.transaction.create.mock.calls[1][0].data.transferGroupId,
      );
      expect(result.type).toBe(TransactionType.TRANSFER);
      expect(result.accountId).toBe(1);
    });

    it('rejects a TRANSFER without destinationAccountId', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 0 }),
      );

      await expect(
        service.createTransaction(1, { ...transferDto, destinationAccountId: undefined }),
      ).rejects.toThrow('Destination account is required for a transfer');
    });

    it('rejects a TRANSFER to the same account', async () => {
      userExists();
      mockPrisma.account.findFirst.mockResolvedValue(
        makeAccount(BigInt(1), { startBalance: 0 }),
      );

      await expect(
        service.createTransaction(1, { ...transferDto, destinationAccountId: 1 }),
      ).rejects.toThrow('Source and destination accounts must differ');
    });

    it('throws NotFoundException when destination account does not belong to user', async () => {
      userExists();
      mockPrisma.account.findFirst
        .mockResolvedValueOnce(makeAccount(BigInt(1), { startBalance: 0 }))
        .mockResolvedValueOnce(null);

      await expect(service.createTransaction(1, transferDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateTransaction', () => {
    it('updates only the provided fields', async () => {
      const existingTx = makeTransaction(BigInt(5));
      mockPrisma.transaction.findFirst.mockResolvedValue(existingTx);
      mockPrisma.transaction.update.mockResolvedValue(existingTx);

      const dto: UpdateTransactionDto = { payee: 'Supermarket', amount: 99 };
      await service.updateTransaction(1, 5, dto);

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(5) },
          data: expect.objectContaining({
            payee: 'Supermarket',
            amount: new Prisma.Decimal(99),
          }),
        }),
      );
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.updateTransaction(1, 99, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteTransaction', () => {
    it('performs a hard delete of the transaction', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(
        makeTransaction(BigInt(7)),
      );
      mockPrisma.transaction.delete.mockResolvedValue(undefined);

      await service.deleteTransaction(1, 7);

      expect(mockPrisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: BigInt(7) },
      });
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.deleteTransaction(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes both legs when deleting a transfer', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({
        ...makeTransaction(BigInt(10), { type: TransactionType.TRANSFER }),
        transferGroupId: 'grp',
      });
      mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 2 });

      await service.deleteTransaction(1, 10);

      expect(mockPrisma.transaction.deleteMany).toHaveBeenCalledWith({
        where: { transferGroupId: 'grp', userId: BigInt(1) },
      });
      expect(mockPrisma.transaction.delete).not.toHaveBeenCalled();
    });
  });

  describe('effectiveDate serialization', () => {
    it('formats effectiveDate as YYYY-MM-DD string in the response', async () => {
      const tx = makeTransaction(BigInt(1), {
        effectiveDate: '2024-06-15T00:00:00.000Z',
      });
      mockPrisma.transaction.findFirst.mockResolvedValue(tx);

      const result = await service.getTransaction(1, 1);

      expect(result.effectiveDate).toBe('2024-06-15');
    });
  });
});
