import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryType } from '../common/enums';
import { CategoriesService } from './categories.service';
import type { CreateUserCategoryDto } from './dto/create-user-category.dto';
import type { UpdateUserCategoryDto } from './dto/update-user-category.dto';

const makeUserCat = (
  id: bigint,
  opts: {
    type?: string;
    name?: string;
    icon?: string | null;
    parentId?: bigint | null;
    isActive?: boolean;
    isCustom?: boolean;
    sourceCategoryId?: bigint | null;
  } = {},
) => ({
  id,
  userId: BigInt(1),
  name: opts.name ?? `Category ${id}`,
  type: opts.type ?? CategoryType.EXPENSE,
  icon: opts.icon ?? null,
  parentId: opts.parentId ?? null,
  isActive: opts.isActive ?? true,
  isCustom: opts.isCustom ?? false,
  sourceCategoryId: opts.sourceCategoryId ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeCatalogCat = (
  id: bigint,
  opts: { parentId?: bigint | null; type?: string; name?: string } = {},
) => ({
  id,
  name: opts.name ?? `Cat ${id}`,
  type: opts.type ?? CategoryType.EXPENSE,
  icon: null,
  parentId: opts.parentId ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('CategoriesService', () => {
  let service: CategoriesService;

  const mockTx = {
    userCategory: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    category: { findMany: jest.fn() },
    categoryTranslation: { findMany: jest.fn() },
    userCategory: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: BigInt(1) });
    mockPrisma.categoryTranslation.findMany.mockResolvedValue([]);
  });

  // ─── getCategoryCatalog ───────────────────────────────────────────────────

  describe('getCategoryCatalog', () => {
    it('returns a flat list as a nested tree', async () => {
      const parent = makeCatalogCat(BigInt(1));
      const child = makeCatalogCat(BigInt(2), { parentId: BigInt(1) });
      mockPrisma.category.findMany.mockResolvedValue([parent, child]);

      const result = await service.getCategoryCatalog();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe(2);
    });

    it('uses translations for the requested language', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        makeCatalogCat(BigInt(1), { name: 'English name' }),
      ]);
      mockPrisma.categoryTranslation.findMany.mockResolvedValue([
        { categoryId: BigInt(1), name: 'Nombre en español', language: 'es' },
      ]);

      const result = await service.getCategoryCatalog('es');

      expect(result[0].name).toBe('Nombre en español');
    });

    it('falls back to English when requested language has no translations', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        makeCatalogCat(BigInt(1), { name: 'Default name' }),
      ]);
      // First call (fr) returns empty, second call (en) returns translations
      mockPrisma.categoryTranslation.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { categoryId: BigInt(1), name: 'English fallback', language: 'en' },
        ]);

      const result = await service.getCategoryCatalog('fr');

      expect(result[0].name).toBe('English fallback');
    });

    it('uses the base language code when a sub-tag is provided (en-US → en)', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        makeCatalogCat(BigInt(1)),
      ]);

      await service.getCategoryCatalog('en-US');

      expect(mockPrisma.categoryTranslation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { language: expect.objectContaining({ equals: 'en' }) },
        }),
      );
    });

    it('filters by type when provided', async () => {
      const income = makeCatalogCat(BigInt(1), { type: CategoryType.INCOME });
      const expense = makeCatalogCat(BigInt(2), { type: CategoryType.EXPENSE });
      mockPrisma.category.findMany.mockResolvedValue([income, expense]);

      const result = await service.getCategoryCatalog(
        undefined,
        CategoryType.INCOME,
      );

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(CategoryType.INCOME);
    });
  });

  // ─── getUserCategories ────────────────────────────────────────────────────

  describe('getUserCategories', () => {
    it('returns all active categories as a tree', async () => {
      const parent = makeUserCat(BigInt(1));
      const child = makeUserCat(BigInt(2), { parentId: BigInt(1) });
      mockPrisma.userCategory.findMany.mockResolvedValue([parent, child]);

      const result = await service.getUserCategories(1, false);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserCategories(1, false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('filters by type in memory', async () => {
      const income = makeUserCat(BigInt(1), { type: CategoryType.INCOME });
      const expense = makeUserCat(BigInt(2), { type: CategoryType.EXPENSE });
      mockPrisma.userCategory.findMany.mockResolvedValue([income, expense]);

      const result = await service.getUserCategories(
        1,
        false,
        CategoryType.INCOME,
      );

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(CategoryType.INCOME);
    });
  });

  // ─── createUserCategory ───────────────────────────────────────────────────

  describe('createUserCategory', () => {
    const dto: CreateUserCategoryDto = {
      name: 'New category',
      type: CategoryType.EXPENSE,
    };

    it('creates a root category when no parentId is provided', async () => {
      mockPrisma.userCategory.findMany.mockResolvedValue([]);
      const created = makeUserCat(BigInt(10), { name: 'New category' });
      mockPrisma.userCategory.create.mockResolvedValue(created);

      const result = await service.createUserCategory(1, dto);

      expect(mockPrisma.userCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: null, isCustom: true }),
        }),
      );
      expect(result.children).toEqual([]);
    });

    it('creates a child category under an active parent with the same type', async () => {
      const parent = makeUserCat(BigInt(1), {
        type: CategoryType.EXPENSE,
        isActive: true,
      });
      mockPrisma.userCategory.findMany.mockResolvedValue([parent]);
      const created = makeUserCat(BigInt(10), {
        name: 'New category',
        parentId: BigInt(1),
      });
      mockPrisma.userCategory.create.mockResolvedValue(created);

      await service.createUserCategory(1, {
        ...dto,
        parentId: 1,
      });

      expect(mockPrisma.userCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: BigInt(1) }),
        }),
      );
    });

    it('throws BadRequestException when parent type differs', async () => {
      const parent = makeUserCat(BigInt(1), {
        type: CategoryType.INCOME,
        isActive: true,
      });
      mockPrisma.userCategory.findMany.mockResolvedValue([parent]);

      await expect(
        service.createUserCategory(1, {
          ...dto,
          type: CategoryType.EXPENSE,
          parentId: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when parent is inactive', async () => {
      const parent = makeUserCat(BigInt(1), { isActive: false });
      mockPrisma.userCategory.findMany.mockResolvedValue([parent]);

      await expect(
        service.createUserCategory(1, { ...dto, parentId: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when parent does not exist', async () => {
      mockPrisma.userCategory.findMany.mockResolvedValue([]);

      await expect(
        service.createUserCategory(1, { ...dto, parentId: 99 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── updateUserCategory ───────────────────────────────────────────────────

  describe('updateUserCategory', () => {
    it('throws NotFoundException when category does not belong to user', async () => {
      mockPrisma.userCategory.findMany.mockResolvedValue([]);

      await expect(
        service.updateUserCategory(1, 99, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when setting a category as its own parent', async () => {
      const cat = makeUserCat(BigInt(1));
      mockPrisma.userCategory.findMany.mockResolvedValue([cat]);

      await expect(
        service.updateUserCategory(1, 1, { parentId: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('detects cycles in hierarchy', async () => {
      // A → B → C, trying to set A's parent to C (creating A ← C ← B ← A)
      const a = makeUserCat(BigInt(1), { parentId: null });
      const b = makeUserCat(BigInt(2), { parentId: BigInt(1) });
      const c = makeUserCat(BigInt(3), { parentId: BigInt(2) });
      mockPrisma.userCategory.findMany.mockResolvedValue([a, b, c]);

      await expect(
        service.updateUserCategory(1, 1, { parentId: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deactivates the category and all its descendants via BFS', async () => {
      const root = makeUserCat(BigInt(1));
      const child = makeUserCat(BigInt(2), { parentId: BigInt(1) });
      const grandchild = makeUserCat(BigInt(3), { parentId: BigInt(2) });
      mockPrisma.userCategory.findMany.mockResolvedValue([
        root,
        child,
        grandchild,
      ]);
      const updatedRoot = { ...root, isActive: false };
      mockTx.userCategory.update.mockResolvedValue(updatedRoot);

      const dto: UpdateUserCategoryDto = { active: false };
      await service.updateUserCategory(1, 1, dto);

      expect(mockTx.userCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(1) },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
      expect(mockTx.userCategory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: expect.arrayContaining([BigInt(2), BigInt(3)]) } },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('reactivates the category and all its descendants via BFS', async () => {
      const root = makeUserCat(BigInt(1), { isActive: false });
      const child = makeUserCat(BigInt(2), {
        parentId: BigInt(1),
        isActive: false,
      });
      mockPrisma.userCategory.findMany.mockResolvedValue([root, child]);
      mockTx.userCategory.update.mockResolvedValue({ ...root, isActive: true });

      await service.updateUserCategory(1, 1, { active: true });

      expect(mockTx.userCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(mockTx.userCategory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [BigInt(2)] } },
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('throws BadRequestException when reactivating a category whose parent is inactive', async () => {
      const inactiveParent = makeUserCat(BigInt(1), { isActive: false });
      const child = makeUserCat(BigInt(2), {
        parentId: BigInt(1),
        isActive: false,
      });
      mockPrisma.userCategory.findMany.mockResolvedValue([
        inactiveParent,
        child,
      ]);

      await expect(
        service.updateUserCategory(1, 2, { active: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── deleteUserCategory ───────────────────────────────────────────────────

  describe('deleteUserCategory', () => {
    it('throws NotFoundException when category does not belong to user', async () => {
      mockPrisma.userCategory.findMany.mockResolvedValue([]);

      await expect(service.deleteUserCategory(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('soft-deletes the category and all descendants', async () => {
      const root = makeUserCat(BigInt(1));
      const child = makeUserCat(BigInt(2), { parentId: BigInt(1) });
      const grandchild = makeUserCat(BigInt(3), { parentId: BigInt(2) });
      mockPrisma.userCategory.findMany.mockResolvedValue([
        root,
        child,
        grandchild,
      ]);

      await service.deleteUserCategory(1, 1);

      expect(mockPrisma.userCategory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: {
              in: expect.arrayContaining([BigInt(1), BigInt(2), BigInt(3)]),
            },
          },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('soft-deletes only the target when it has no descendants', async () => {
      const leaf = makeUserCat(BigInt(5));
      mockPrisma.userCategory.findMany.mockResolvedValue([leaf]);

      await service.deleteUserCategory(1, 5);

      expect(mockPrisma.userCategory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [BigInt(5)] } },
        }),
      );
    });
  });
});
