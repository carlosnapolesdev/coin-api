import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from './tags.service';

describe('TagsService', () => {
  let service: TagsService;

  const mockTx = {
    tag: {
      update: jest.fn(),
      delete: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    tag: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
      ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
    jest.clearAllMocks();
  });

  describe('syncTags', () => {
    it('creates a Tag row for each name in a simple CSV', async () => {
      mockPrisma.tag.createMany.mockResolvedValue({ count: 2 });

      await service.syncTags(1, 'food, travel');

      expect(mockPrisma.tag.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          { userId: BigInt(1), name: 'food' },
          { userId: BigInt(1), name: 'travel' },
        ]),
        skipDuplicates: true,
      });
    });

    it('returns immediately and skips createMany when the CSV is null', async () => {
      await service.syncTags(1, null);

      expect(mockPrisma.tag.createMany).not.toHaveBeenCalled();
    });

    it('returns immediately and skips createMany when the CSV is undefined', async () => {
      await service.syncTags(1, undefined);

      expect(mockPrisma.tag.createMany).not.toHaveBeenCalled();
    });

    it('returns immediately and skips createMany when the CSV is an empty string', async () => {
      await service.syncTags(1, '');

      expect(mockPrisma.tag.createMany).not.toHaveBeenCalled();
    });

    it('trims whitespace around tag names', async () => {
      mockPrisma.tag.createMany.mockResolvedValue({ count: 2 });

      await service.syncTags(1, '  food ,  travel  ');

      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: BigInt(1), name: 'food' },
          { userId: BigInt(1), name: 'travel' },
        ],
        skipDuplicates: true,
      });
    });

    it('drops empty segments from the CSV', async () => {
      mockPrisma.tag.createMany.mockResolvedValue({ count: 1 });

      await service.syncTags(1, 'food, ,  ,,travel,');

      expect(mockPrisma.tag.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          { userId: BigInt(1), name: 'food' },
          { userId: BigInt(1), name: 'travel' },
        ]),
        skipDuplicates: true,
      });
    });

    it('skips createMany when the CSV only contains whitespace and separators', async () => {
      await service.syncTags(1, ' , ,  ');

      expect(mockPrisma.tag.createMany).not.toHaveBeenCalled();
    });

    it('dedupes repeated names within the same CSV', async () => {
      mockPrisma.tag.createMany.mockResolvedValue({ count: 1 });

      await service.syncTags(1, 'food, food, travel, food');

      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: BigInt(1), name: 'food' },
          { userId: BigInt(1), name: 'travel' },
        ],
        skipDuplicates: true,
      });
    });

    it('respects case sensitivity (matches DB unique index exactly)', async () => {
      mockPrisma.tag.createMany.mockResolvedValue({ count: 2 });

      await service.syncTags(1, 'Food, food');

      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: BigInt(1), name: 'Food' },
          { userId: BigInt(1), name: 'food' },
        ],
        skipDuplicates: true,
      });
    });

    it('always uses skipDuplicates: true so reruns are idempotent', async () => {
      mockPrisma.tag.createMany.mockResolvedValue({ count: 0 });

      await service.syncTags(1, 'food');

      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });

    it('drops tag names longer than 100 chars (silent drop, mirrors backfill)', async () => {
      const oversize = 'a'.repeat(101);

      await service.syncTags(1, `food,${oversize},travel`);

      expect(mockPrisma.tag.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith({
        data: [
          { userId: BigInt(1), name: 'food' },
          { userId: BigInt(1), name: 'travel' },
        ],
        skipDuplicates: true,
      });
    });

    it('keeps tag names of exactly 100 chars (boundary)', async () => {
      const boundary = 'a'.repeat(100);
      mockPrisma.tag.createMany.mockResolvedValue({ count: 1 });

      await service.syncTags(1, boundary);

      expect(mockPrisma.tag.createMany).toHaveBeenCalledWith({
        data: [{ userId: BigInt(1), name: boundary }],
        skipDuplicates: true,
      });
    });

    it('skips createMany entirely when every name exceeds 100 chars', async () => {
      const oversize = 'a'.repeat(101);

      await service.syncTags(1, `${oversize},${'b'.repeat(150)}`);

      expect(mockPrisma.tag.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns an empty array when the user has no tags', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.list(1);

      expect(result).toEqual([]);
    });

    it('returns each tag with its usageCount from the transactions table', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([
        { id: BigInt(10), name: 'food' },
        { id: BigInt(11), name: 'travel' },
      ]);
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([
          { tags: 'food, travel' },
          { tags: 'food, drinks' },
          { tags: 'seafood' },
        ])
        .mockResolvedValueOnce([{ tags: 'travel' }, { tags: 'travel, food' }]);

      const result = await service.list(1);

      expect(result).toEqual([
        { id: 10, name: 'food', usageCount: 3 },
        { id: 11, name: 'travel', usageCount: 2 },
      ]);
      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { userId: BigInt(1) },
        orderBy: { name: 'asc' },
      });
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledTimes(2);
    });

    it('returns usageCount 0 for tags that no transaction references', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([
        { id: BigInt(10), name: 'orphan' },
      ]);
      mockPrisma.transaction.findMany.mockResolvedValueOnce([]);

      const result = await service.list(1);

      expect(result).toEqual([{ id: 10, name: 'orphan', usageCount: 0 }]);
    });

    it('scopes the count query to the user via userId in the WHERE clause', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([{ id: BigInt(1), name: 'x' }]);
      mockPrisma.transaction.findMany.mockResolvedValueOnce([]);

      await service.list(7);

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
        where: { userId: BigInt(7), tags: { contains: 'x' } },
        select: { tags: true },
      });
    });
  });

  // ─── rename ────────────────────────────────────────────────────────────────

  describe('rename', () => {
    it('updates the tag name and rewrites the CSV in affected transactions', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });
      mockPrisma.tag.findFirst.mockResolvedValueOnce({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });
      mockPrisma.tag.findFirst.mockResolvedValueOnce(null);
      mockTx.tag.update.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'groceries',
      });
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food, travel' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});

      const result = await service.rename(1, 10, 'groceries');

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockTx.tag.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: { name: 'groceries' },
      });
      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: 'groceries, travel' },
      });
      expect(result).toEqual({ id: 10, name: 'groceries' });
    });

    it('throws NotFoundException when the tag does not belong to the user', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.rename(1, 99, 'new-name')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when newName is empty', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });

      await expect(service.rename(1, 10, '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when newName is whitespace only', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });

      await expect(service.rename(1, 10, '   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when newName exceeds 100 chars', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });

      await expect(
        service.rename(1, 10, 'a'.repeat(101)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the new name already exists for the user', async () => {
      mockPrisma.tag.findFirst
        .mockResolvedValueOnce({
          id: BigInt(10),
          userId: BigInt(1),
          name: 'food',
        })
        .mockResolvedValueOnce({
          id: BigInt(11),
          userId: BigInt(1),
          name: 'groceries',
        });

      await expect(service.rename(1, 10, 'groceries')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not rewrite transactions whose CSV does not contain the old name', async () => {
      mockPrisma.tag.findFirst
        .mockResolvedValueOnce({
          id: BigInt(10),
          userId: BigInt(1),
          name: 'food',
        })
        .mockResolvedValueOnce(null);
      mockTx.tag.update.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'groceries',
      });
      // Prisma's `tags contains 'food'` filter only returns matching rows;
      // the mock simulates that by returning only the affected transaction.
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food, travel' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});

      await service.rename(1, 10, 'groceries');

      expect(mockTx.transaction.update).toHaveBeenCalledTimes(1);
      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: 'groceries, travel' },
      });
    });

    it('handles a CSV with multiple occurrences of the old name by deduping after rename', async () => {
      mockPrisma.tag.findFirst
        .mockResolvedValueOnce({
          id: BigInt(10),
          userId: BigInt(1),
          name: 'food',
        })
        .mockResolvedValueOnce(null);
      mockTx.tag.update.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'groceries',
      });
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food, food, travel' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});

      await service.rename(1, 10, 'groceries');

      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: 'groceries, travel' },
      });
    });

    it('trims whitespace around the new name before storing', async () => {
      mockPrisma.tag.findFirst
        .mockResolvedValueOnce({
          id: BigInt(10),
          userId: BigInt(1),
          name: 'food',
        })
        .mockResolvedValueOnce(null);
      mockTx.tag.update.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'groceries',
      });
      mockTx.transaction.findMany.mockResolvedValue([]);

      await service.rename(1, 10, '  groceries  ');

      expect(mockTx.tag.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: { name: 'groceries' },
      });
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the tag and removes the tag from the CSV of affected transactions', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food, travel' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});
      mockTx.tag.delete.mockResolvedValue({});

      await service.remove(1, 10);

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: 'travel' },
      });
      expect(mockTx.tag.delete).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
      });
    });

    it('preserves other tokens in the CSV when removing a tag', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food, travel, drinks' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});
      mockTx.tag.delete.mockResolvedValue({});

      await service.remove(1, 10);

      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: 'travel, drinks' },
      });
    });

    it('writes null when the CSV becomes empty after removing the tag', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});
      mockTx.tag.delete.mockResolvedValue({});

      await service.remove(1, 10);

      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: null },
      });
    });

    it('throws NotFoundException when the tag does not belong to the user', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.remove(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('still deletes the tag row when no transactions reference it', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'orphan',
      });
      mockTx.transaction.findMany.mockResolvedValue([]);
      mockTx.tag.delete.mockResolvedValue({});

      await service.remove(1, 10);

      expect(mockTx.transaction.update).not.toHaveBeenCalled();
      expect(mockTx.tag.delete).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
      });
    });
  });

  // ─── CSV rewrite semantics (cross-method) ──────────────────────────────────

  describe('CSV rewrite semantics', () => {
    it('rename uses case-sensitive comparison to match the DB unique index', async () => {
      mockPrisma.tag.findFirst
        .mockResolvedValueOnce({
          id: BigInt(10),
          userId: BigInt(1),
          name: 'food',
        })
        .mockResolvedValueOnce(null);
      mockTx.tag.update.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'Food',
      });
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food, Food, travel' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});

      await service.rename(1, 10, 'Food');

      // After renaming `food → Food`, both tokens become `Food` and the
      // dedupe step collapses them to a single occurrence.
      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: 'Food, travel' },
      });
    });

    it('remove uses case-sensitive comparison so removing `food` does not touch `Food`', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue({
        id: BigInt(10),
        userId: BigInt(1),
        name: 'food',
      });
      mockTx.transaction.findMany.mockResolvedValue([
        { id: BigInt(100), tags: 'food, Food, travel' },
      ]);
      mockTx.transaction.update.mockResolvedValue({});
      mockTx.tag.delete.mockResolvedValue({});

      await service.remove(1, 10);

      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: BigInt(100) },
        data: { tags: 'Food, travel' },
      });
    });
  });
});
