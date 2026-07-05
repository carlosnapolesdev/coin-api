import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionStatus, TransactionType } from '../../common/enums';
import { ImportService } from './import.service';
import type { ImportRowDto } from './dto/import-commit.dto';

describe('ImportService', () => {
  let service: ImportService;

  const mockPrisma = {
    account: { findMany: jest.fn() },
    userCategory: { findMany: jest.fn() },
    transaction: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
    jest.clearAllMocks();
  });

  describe('previewCsv', () => {
    const csv = [
      'date,account,category,type,amount,payee,paymentMethod,status,tags,memo',
      '2026-07-01,Checking,Groceries,EXPENSE,45.50,Market,Cash,CLEARED,,Weekly groceries',
      'not-a-date,Checking,Groceries,EXPENSE,10.00,Market,Cash,CLEARED,,Bad date row',
    ].join('\n');

    it('marks the valid row as valid and reports an error for the invalid date row', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        { id: BigInt(1), name: 'Checking' },
      ]);
      mockPrisma.userCategory.findMany.mockResolvedValue([
        { id: BigInt(1), name: 'Groceries' },
      ]);

      const result = await service.previewCsv(1, Buffer.from(csv));

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].valid).toBe(true);
      expect(result.rows[0].accountId).toBe(1);
      expect(result.rows[0].categoryId).toBe(1);
      expect(result.rows[1].valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ line: 3 }),
      );
    });

    it('rejects an unresolvable account name', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.userCategory.findMany.mockResolvedValue([]);

      const singleRowCsv = [
        'date,account,category,type,amount,payee,paymentMethod,status,tags,memo',
        '2026-07-01,Unknown,,EXPENSE,10.00,,,,,',
      ].join('\n');

      const result = await service.previewCsv(1, Buffer.from(singleRowCsv));

      expect(result.rows[0].valid).toBe(false);
      expect(result.errors[0].message).toMatch(
        /Account "Unknown" was not found/,
      );
    });

    it('throws when required columns cannot be mapped', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.userCategory.findMany.mockResolvedValue([]);

      const badCsv = ['foo,bar', '1,2'].join('\n');

      await expect(service.previewCsv(1, Buffer.from(badCsv))).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('commitImport', () => {
    const makeRow = (overrides: Partial<ImportRowDto> = {}): ImportRowDto => ({
      line: 2,
      valid: true,
      accountId: 1,
      type: TransactionType.EXPENSE,
      amount: 10,
      effectiveDate: '2026-07-01',
      status: TransactionStatus.CLEARED,
      ...overrides,
    });

    it('creates all valid rows within a single transaction', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: BigInt(1) }]);
      mockPrisma.userCategory.findMany.mockResolvedValue([]);
      mockPrisma.transaction.create.mockReturnValue({});
      mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const rows = [makeRow(), makeRow({ line: 3 }), makeRow({ line: 4 })];
      const result = await service.commitImport(1, rows);

      expect(result.created).toBe(3);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(3);
    });

    it('ignores rows marked invalid', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: BigInt(1) }]);
      mockPrisma.userCategory.findMany.mockResolvedValue([]);

      const result = await service.commitImport(1, [makeRow({ valid: false })]);

      expect(result.created).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a row whose account does not belong to the user', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: BigInt(99) }]);
      mockPrisma.userCategory.findMany.mockResolvedValue([]);

      await expect(
        service.commitImport(1, [makeRow({ accountId: 1 })]),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
