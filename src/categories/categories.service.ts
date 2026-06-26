import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryType } from '../common/enums';
import type { CategoryCatalogResponseDto } from './dto/category-catalog-response.dto';
import type { UserCategoryResponseDto } from './dto/user-category-response.dto';
import type { CreateUserCategoryDto } from './dto/create-user-category.dto';
import type { UpdateUserCategoryDto } from './dto/update-user-category.dto';

interface CatalogNode {
  id: bigint;
  name: string;
  type: string;
  icon: string | null;
  parentId: bigint | null;
}

@Injectable()
export class CategoriesService {
  private static readonly DEFAULT_LANGUAGE = 'en';

  constructor(private readonly prisma: PrismaService) {}

  async getCategoryCatalog(
    language?: string,
    type?: CategoryType,
  ): Promise<CategoryCatalogResponseDto[]> {
    const lang = this.resolveLanguage(language);

    const [categories, translationMap] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      this.loadTranslationMap(lang),
    ]);

    const nodes: CatalogNode[] = categories
      .filter((c) => !type || c.type === (type as string))
      .map((c) => ({
        id: c.id,
        name: translationMap.get(c.id) ?? c.name,
        type: c.type,
        icon: c.icon,
        parentId: c.parentId,
      }));

    return this.buildCatalogTree(nodes);
  }

  async getUserCategories(
    userId: number,
    includeInactive: boolean,
    type?: CategoryType,
  ): Promise<UserCategoryResponseDto[]> {
    await this.ensureUserExists(userId);

    const userCategories = await this.prisma.userCategory.findMany({
      where: {
        userId: BigInt(userId),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const filtered = type
      ? userCategories.filter((c) => c.type === (type as string))
      : userCategories;

    return this.buildUserTree(filtered);
  }

  async createUserCategory(
    userId: number,
    dto: CreateUserCategoryDto,
  ): Promise<UserCategoryResponseDto> {
    await this.ensureUserExists(userId);

    const allCategories = await this.prisma.userCategory.findMany({
      where: { userId: BigInt(userId) },
    });
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

    const parent =
      dto.parentId != null
        ? this.resolveParent(categoryMap, BigInt(dto.parentId), dto.type, null)
        : null;

    const now = new Date();
    const created = await this.prisma.userCategory.create({
      data: {
        userId: BigInt(userId),
        name: dto.name.trim(),
        type: dto.type,
        icon: dto.icon ? dto.icon.trim() : null,
        parentId: parent ? parent.id : null,
        isActive: true,
        isCustom: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    return this.toFlatUserCategoryResponse(created);
  }

  async updateUserCategory(
    userId: number,
    categoryId: number,
    dto: UpdateUserCategoryDto,
  ): Promise<UserCategoryResponseDto> {
    await this.ensureUserExists(userId);

    const allCategories = await this.prisma.userCategory.findMany({
      where: { userId: BigInt(userId) },
    });
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
    const target = this.getRequiredUserCategory(
      categoryMap,
      BigInt(categoryId),
    );

    const data: Record<string, unknown> = { updatedAt: new Date() };

    if (dto.name !== undefined) data['name'] = dto.name.trim();
    if (dto.icon !== undefined)
      data['icon'] = dto.icon ? dto.icon.trim() : null;
    if (dto.parentId != null) {
      const parent = this.resolveParent(
        categoryMap,
        BigInt(dto.parentId),
        target.type,
        target.id,
      );
      data['parentId'] = parent.id;
    }

    if (dto.active !== undefined) {
      if (dto.active && target.parentId !== null) {
        const parent = categoryMap.get(target.parentId);
        if (parent && !parent.isActive) {
          throw new BadRequestException(
            'Parent category must be active before reactivating this category',
          );
        }
      }

      const descendantIds = this.getBfsDescendantIds(target.id, categoryMap);

      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.userCategory.update({
          where: { id: target.id },
          data: { ...data, isActive: dto.active },
        });
        if (descendantIds.length > 0) {
          await tx.userCategory.updateMany({
            where: { id: { in: descendantIds } },
            data: { isActive: dto.active, updatedAt: new Date() },
          });
        }
        return result;
      });

      return this.toFlatUserCategoryResponse(updated);
    }

    const updated = await this.prisma.userCategory.update({
      where: { id: target.id },
      data,
    });
    return this.toFlatUserCategoryResponse(updated);
  }

  async deleteUserCategory(userId: number, categoryId: number): Promise<void> {
    await this.ensureUserExists(userId);

    const allCategories = await this.prisma.userCategory.findMany({
      where: { userId: BigInt(userId) },
    });
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
    const target = this.getRequiredUserCategory(
      categoryMap,
      BigInt(categoryId),
    );

    const idsToDeactivate = [
      target.id,
      ...this.getBfsDescendantIds(target.id, categoryMap),
    ];

    await this.prisma.userCategory.updateMany({
      where: { id: { in: idsToDeactivate } },
      data: { isActive: false, updatedAt: new Date() },
    });
  }

  // Used by AuthService during registration (Phase 9)
  async assignDefaultCategoriesToUser(
    userId: bigint,
    language: string,
    activeCategoryIds?: Set<bigint>,
  ): Promise<void> {
    const lang = this.resolveLanguage(language);

    const [sourceCategories, translationMap] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      this.loadTranslationMap(lang),
    ]);

    if (sourceCategories.length === 0) return;

    const now = new Date();
    // Maps sourceCategory.id → newly created UserCategory.id
    const cloneMap = new Map<bigint, bigint>();

    await this.prisma.$transaction(async (tx) => {
      // First pass: create all clones without parent links
      for (const source of sourceCategories) {
        const isActive = !activeCategoryIds || activeCategoryIds.has(source.id);
        const created = await tx.userCategory.create({
          data: {
            userId,
            name: translationMap.get(source.id) ?? source.name,
            type: source.type,
            icon: source.icon,
            sourceCategoryId: source.id,
            isActive,
            isCustom: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        cloneMap.set(source.id, created.id);
      }

      // Second pass: wire parent relationships using the clone map
      for (const source of sourceCategories) {
        if (source.parentId !== null) {
          const clonedParentId = cloneMap.get(source.parentId);
          if (clonedParentId !== undefined) {
            await tx.userCategory.update({
              where: { id: cloneMap.get(source.id)! },
              data: { parentId: clonedParentId },
            });
          }
        }
      }
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private resolveParent(
    categoryMap: Map<bigint, UserCategory>,
    parentId: bigint,
    type: string,
    currentId: bigint | null,
  ): UserCategory {
    const parent = categoryMap.get(parentId);
    if (!parent) {
      throw new NotFoundException('Parent category was not found');
    }
    if (!parent.isActive) {
      throw new BadRequestException('Parent category must be active');
    }
    if (parent.type !== type) {
      throw new BadRequestException('Parent category must have the same type');
    }
    if (currentId !== null && parent.id === currentId) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    if (currentId !== null) {
      this.validateNoCycle(parent, currentId, categoryMap);
    }
    return parent;
  }

  private validateNoCycle(
    startParent: UserCategory,
    currentId: bigint,
    categoryMap: Map<bigint, UserCategory>,
  ): void {
    let cursor: UserCategory | undefined = startParent;
    while (cursor !== undefined) {
      if (cursor.id === currentId) {
        throw new BadRequestException(
          'Category hierarchy cannot contain cycles',
        );
      }
      cursor =
        cursor.parentId !== null ? categoryMap.get(cursor.parentId) : undefined;
    }
  }

  private getRequiredUserCategory(
    categoryMap: Map<bigint, UserCategory>,
    categoryId: bigint,
  ): UserCategory {
    const category = categoryMap.get(categoryId);
    if (!category) {
      throw new NotFoundException('User category was not found');
    }
    return category;
  }

  private getBfsDescendantIds(
    rootId: bigint,
    categoryMap: Map<bigint, UserCategory>,
  ): bigint[] {
    const childrenByParentId = new Map<bigint, bigint[]>();
    for (const cat of categoryMap.values()) {
      if (cat.parentId !== null) {
        const siblings = childrenByParentId.get(cat.parentId) ?? [];
        siblings.push(cat.id);
        childrenByParentId.set(cat.parentId, siblings);
      }
    }

    const descendants: bigint[] = [];
    const queue: bigint[] = [rootId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = childrenByParentId.get(current) ?? [];
      for (const childId of children) {
        descendants.push(childId);
        queue.push(childId);
      }
    }
    return descendants;
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

  private async loadTranslationMap(
    language: string,
  ): Promise<Map<bigint, string>> {
    const translations = await this.prisma.categoryTranslation.findMany({
      where: { language: { equals: language, mode: 'insensitive' } },
    });

    if (
      translations.length === 0 &&
      language !== CategoriesService.DEFAULT_LANGUAGE
    ) {
      const fallback = await this.prisma.categoryTranslation.findMany({
        where: {
          language: {
            equals: CategoriesService.DEFAULT_LANGUAGE,
            mode: 'insensitive',
          },
        },
      });
      return new Map(fallback.map((t) => [t.categoryId, t.name]));
    }

    return new Map(translations.map((t) => [t.categoryId, t.name]));
  }

  private resolveLanguage(language?: string): string {
    if (!language?.trim()) {
      return CategoriesService.DEFAULT_LANGUAGE;
    }
    const normalized = language.trim().toLowerCase().replace(/_/g, '-');
    const separatorIndex = normalized.indexOf('-');
    return separatorIndex >= 0
      ? normalized.substring(0, separatorIndex)
      : normalized;
  }

  private buildCatalogTree(nodes: CatalogNode[]): CategoryCatalogResponseDto[] {
    const childrenByParentId = new Map<bigint, CatalogNode[]>();
    for (const node of nodes) {
      if (node.parentId !== null) {
        const siblings = childrenByParentId.get(node.parentId) ?? [];
        siblings.push(node);
        childrenByParentId.set(node.parentId, siblings);
      }
    }

    return nodes
      .filter((node) => node.parentId === null)
      .map((node) => this.toCatalogResponse(node, childrenByParentId));
  }

  private toCatalogResponse(
    node: CatalogNode,
    childrenByParentId: Map<bigint, CatalogNode[]>,
  ): CategoryCatalogResponseDto {
    const children = (childrenByParentId.get(node.id) ?? []).map((child) =>
      this.toCatalogResponse(child, childrenByParentId),
    );
    return {
      id: Number(node.id),
      name: node.name,
      type: node.type,
      icon: node.icon,
      parentId: node.parentId !== null ? Number(node.parentId) : null,
      children,
    };
  }

  private buildUserTree(categories: UserCategory[]): UserCategoryResponseDto[] {
    const childrenByParentId = new Map<bigint, UserCategory[]>();
    for (const cat of categories) {
      if (cat.parentId !== null) {
        const siblings = childrenByParentId.get(cat.parentId) ?? [];
        siblings.push(cat);
        childrenByParentId.set(cat.parentId, siblings);
      }
    }

    return categories
      .filter((cat) => cat.parentId === null)
      .map((cat) => this.toUserCategoryTreeResponse(cat, childrenByParentId));
  }

  private toUserCategoryTreeResponse(
    cat: UserCategory,
    childrenByParentId: Map<bigint, UserCategory[]>,
  ): UserCategoryResponseDto {
    const children = (childrenByParentId.get(cat.id) ?? []).map((child) =>
      this.toUserCategoryTreeResponse(child, childrenByParentId),
    );
    return {
      id: Number(cat.id),
      name: cat.name,
      type: cat.type,
      icon: cat.icon,
      parentId: cat.parentId !== null ? Number(cat.parentId) : null,
      sourceCategoryId:
        cat.sourceCategoryId !== null ? Number(cat.sourceCategoryId) : null,
      active: cat.isActive ?? true,
      custom: cat.isCustom ?? false,
      children,
    };
  }

  private toFlatUserCategoryResponse(
    cat: UserCategory,
  ): UserCategoryResponseDto {
    return {
      id: Number(cat.id),
      name: cat.name,
      type: cat.type,
      icon: cat.icon,
      parentId: cat.parentId !== null ? Number(cat.parentId) : null,
      sourceCategoryId:
        cat.sourceCategoryId !== null ? Number(cat.sourceCategoryId) : null,
      active: cat.isActive ?? true,
      custom: cat.isCustom ?? false,
      children: [],
    };
  }
}
