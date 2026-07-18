import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TagResponseDto } from './dto/tag-response.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async syncTags(
    userId: number,
    tagsCsv: string | null | undefined,
  ): Promise<void> {
    if (!tagsCsv) return;

    const names = Array.from(
      new Set(
        tagsCsv
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name.length > 0 && name.length <= 100),
      ),
    );

    if (names.length === 0) return;

    const data: Prisma.TagCreateManyInput[] = names.map((name) => ({
      userId: BigInt(userId),
      name,
    }));

    await this.prisma.tag.createMany({ data, skipDuplicates: true });
  }

  async list(userId: number): Promise<TagResponseDto[]> {
    const tags = await this.prisma.tag.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { name: 'asc' },
    });

    const result: TagResponseDto[] = [];
    for (const tag of tags) {
      const usages = await this.prisma.transaction.findMany({
        where: { userId: BigInt(userId), tags: { contains: tag.name } },
        select: { tags: true },
      });
      // TODO: `contains` is a substring match, so a tag named `food` will
      // also match a transaction with the tag `seafood`. The count is a
      // deliberate upper bound for now (per the Task 3 brief); an exact,
      // token-aware count would need either a regex post-filter or a
      // join table to replace the CSV column.
      result.push({
        id: Number(tag.id),
        name: tag.name,
        usageCount: usages.length,
      });
    }
    return result;
  }

  async rename(
    userId: number,
    id: number,
    newName: string,
  ): Promise<TagResponseDto> {
    const trimmed = newName?.trim() ?? '';
    if (trimmed.length === 0) {
      throw new BadRequestException('Tag name must not be empty');
    }
    if (trimmed.length > 100) {
      throw new BadRequestException('Tag name must be at most 100 characters');
    }

    const tag = await this.prisma.tag.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId) },
    });
    if (!tag) {
      throw new NotFoundException('Tag was not found');
    }

    const collision = await this.prisma.tag.findFirst({
      where: {
        userId: BigInt(userId),
        name: trimmed,
        NOT: { id: BigInt(id) },
      },
    });
    if (collision) {
      throw new ConflictException(
        `A tag named "${trimmed}" already exists for this user`,
      );
    }

    const oldName = tag.name;
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedTag = await tx.tag.update({
        where: { id: tag.id },
        data: { name: trimmed },
      });

      const affected = await tx.transaction.findMany({
        where: {
          userId: BigInt(userId),
          tags: { contains: oldName },
        },
        select: { id: true, tags: true },
      });

      for (const t of affected) {
        if (t.tags === null) continue;
        const rewritten = rewriteCsvForRename(t.tags, oldName, trimmed);
        await tx.transaction.update({
          where: { id: t.id },
          data: { tags: rewritten },
        });
      }

      return updatedTag;
    });

    return { id: Number(updated.id), name: updated.name };
  }

  async remove(userId: number, id: number): Promise<void> {
    const tag = await this.prisma.tag.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId) },
    });
    if (!tag) {
      throw new NotFoundException('Tag was not found');
    }

    const tagName = tag.name;

    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.transaction.findMany({
        where: {
          userId: BigInt(userId),
          tags: { contains: tagName },
        },
        select: { id: true, tags: true },
      });

      for (const t of affected) {
        if (t.tags === null) continue;
        const rewritten = rewriteCsvForRemove(t.tags, tagName);
        await tx.transaction.update({
          where: { id: t.id },
          data: { tags: rewritten },
        });
      }

      await tx.tag.delete({ where: { id: tag.id } });
    });
  }
}

// Token comparison is intentionally case-sensitive to match the DB unique
// constraint `uq_tags_user_name`. `Food` and `food` are distinct tags.
function rewriteCsvForRename(
  csv: string,
  oldName: string,
  newName: string,
): string {
  const tokens = csv
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const replaced = tokens.map((token) => (token === oldName ? newName : token));
  const deduped = Array.from(new Set(replaced));

  if (deduped.length === 0) return csv;
  return deduped.join(', ');
}

function rewriteCsvForRemove(csv: string, name: string): string | null {
  const tokens = csv
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const filtered = tokens.filter((token) => token !== name);
  if (filtered.length === 0) return null;
  return filtered.join(', ');
}
