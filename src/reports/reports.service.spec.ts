import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrisma = {
    transaction: { findMany: jest.fn() },
    account: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    jest.clearAllMocks();
  });

  describe('incomeVsExpense', () => {
    it('groups income and expense by month', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          type: 'INCOME',
          amount: new Prisma.Decimal(1000),
          effectiveDate: new Date('2026-06-10'),
        },
        {
          type: 'EXPENSE',
          amount: new Prisma.Decimal(300),
          effectiveDate: new Date('2026-06-15'),
        },
        {
          type: 'EXPENSE',
          amount: new Prisma.Decimal(200),
          effectiveDate: new Date('2026-07-02'),
        },
      ]);

      const res = await service.incomeVsExpense(1, {
        from: '2026-06-01',
        to: '2026-07-31',
      });

      const june = res.find((p) => p.month === '2026-06')!;
      const july = res.find((p) => p.month === '2026-07')!;
      expect(june.income).toBe(1000);
      expect(june.expense).toBe(300);
      expect(june.net).toBe(700);
      expect(july.income).toBe(0);
      expect(july.expense).toBe(200);
      expect(july.net).toBe(-200);
    });

    it('excludes accounts with excludeFromAnyReports', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      await service.incomeVsExpense(1, {});

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            account: { excludeFromAnyReports: false },
          }),
        }),
      );
    });

    it('returns an empty array when there are no transactions in range', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const res = await service.incomeVsExpense(1, {
        from: '2026-06-01',
        to: '2026-07-31',
      });

      expect(res).toEqual([]);
    });
  });

  describe('categoryBreakdown', () => {
    it('sums expenses per category, sorted by total descending', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          amount: new Prisma.Decimal(100),
          categoryId: BigInt(1),
          userCategory: { name: 'Groceries' },
        },
        {
          amount: new Prisma.Decimal(50),
          categoryId: BigInt(1),
          userCategory: { name: 'Groceries' },
        },
        {
          amount: new Prisma.Decimal(300),
          categoryId: BigInt(2),
          userCategory: { name: 'Rent' },
        },
        {
          amount: new Prisma.Decimal(20),
          categoryId: null,
          userCategory: null,
        },
      ]);

      const res = await service.categoryBreakdown(1, {});

      expect(res).toEqual([
        { categoryId: 2, categoryName: 'Rent', total: 300 },
        { categoryId: 1, categoryName: 'Groceries', total: 150 },
        { categoryId: null, categoryName: 'Uncategorized', total: 20 },
      ]);
    });
  });

  describe('netWorthTrend', () => {
    it('starts from the base balance and adds each month net', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        { startBalance: new Prisma.Decimal(1000) },
        { startBalance: new Prisma.Decimal(500) },
      ]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          type: 'INCOME',
          amount: new Prisma.Decimal(400),
          effectiveDate: new Date('2026-06-10'),
        },
        {
          type: 'EXPENSE',
          amount: new Prisma.Decimal(100),
          effectiveDate: new Date('2026-06-15'),
        },
      ]);

      const res = await service.netWorthTrend(1, {
        from: '2026-06-01',
        to: '2026-06-30',
      });

      expect(res).toEqual([{ month: '2026-06', balance: 1800 }]);
    });

    it('filters accounts by isActive and excludeFromAnyReports', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      await service.netWorthTrend(1, {});

      expect(mockPrisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: BigInt(1),
            isActive: true,
            excludeFromAnyReports: false,
          },
        }),
      );
    });
  });
});
