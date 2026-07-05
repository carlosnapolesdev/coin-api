import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionStatus, TransactionType } from '../../common/enums';
import {
  IMPORT_TARGET_FIELDS,
  type ColumnMapping,
  type ImportError,
  type ImportPreviewResult,
  type ImportRow,
  type ImportTargetField,
} from './import.types';
import type { ImportRowDto } from './dto/import-commit.dto';

const REQUIRED_FIELDS: ImportTargetField[] = [
  'date',
  'account',
  'type',
  'amount',
];

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async previewCsv(
    userId: number,
    buffer: Buffer,
    mapping?: ColumnMapping,
  ): Promise<ImportPreviewResult> {
    let records: Record<string, string>[];
    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new BadRequestException('Could not parse CSV file');
    }

    if (records.length === 0) {
      return { rows: [], errors: [] };
    }

    const headers = Object.keys(records[0]);
    const resolvedMapping = this.resolveMapping(headers, mapping);

    const [accounts, categories] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId: BigInt(userId) },
        select: { id: true, name: true },
      }),
      this.prisma.userCategory.findMany({
        where: { userId: BigInt(userId) },
        select: { id: true, name: true },
      }),
    ]);
    const accountByName = new Map(
      accounts.map((a) => [a.name.trim().toLowerCase(), Number(a.id)]),
    );
    const categoryByName = new Map(
      categories.map((c) => [c.name.trim().toLowerCase(), Number(c.id)]),
    );

    const rows: ImportRow[] = [];
    const errors: ImportError[] = [];

    records.forEach((record, index) => {
      const line = index + 2;
      const row = this.buildRow(
        line,
        record,
        resolvedMapping,
        accountByName,
        categoryByName,
      );
      row.errors.forEach((message) => errors.push({ line, message }));
      rows.push(row);
    });

    return { rows, errors };
  }

  async commitImport(
    userId: number,
    rows: ImportRowDto[],
  ): Promise<{ created: number }> {
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) {
      return { created: 0 };
    }

    const [accounts, categories] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId: BigInt(userId) },
        select: { id: true },
      }),
      this.prisma.userCategory.findMany({
        where: { userId: BigInt(userId) },
        select: { id: true },
      }),
    ]);
    const accountIds = new Set(accounts.map((a) => Number(a.id)));
    const categoryIds = new Set(categories.map((c) => Number(c.id)));

    for (const row of validRows) {
      const isValidReference =
        row.accountId !== undefined &&
        accountIds.has(row.accountId) &&
        (row.categoryId === undefined || categoryIds.has(row.categoryId));
      const hasRequiredFields =
        row.type !== undefined &&
        row.type !== TransactionType.TRANSFER &&
        row.amount !== undefined &&
        row.amount > 0 &&
        Boolean(row.effectiveDate);

      if (!isValidReference || !hasRequiredFields) {
        throw new BadRequestException(
          `Row at line ${row.line} is missing required fields or references an account/category that is not yours`,
        );
      }
    }

    const now = new Date();
    await this.prisma.$transaction(
      validRows.map((row) =>
        this.prisma.transaction.create({
          data: {
            userId: BigInt(userId),
            accountId: BigInt(row.accountId as number),
            categoryId:
              row.categoryId !== undefined ? BigInt(row.categoryId) : null,
            type: row.type as string,
            amount: new Prisma.Decimal(row.amount as number),
            effectiveDate: new Date(row.effectiveDate as string),
            payee: row.payee ?? null,
            paymentMethod: row.paymentMethod ?? null,
            memo: row.memo ?? null,
            status: row.status ?? TransactionStatus.CLEARED,
            tags: row.tags ?? null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    return { created: validRows.length };
  }

  private resolveMapping(
    headers: string[],
    mapping?: ColumnMapping,
  ): ColumnMapping {
    const headerByLowerName = new Map(
      headers.map((h) => [h.trim().toLowerCase(), h]),
    );
    const resolved: ColumnMapping = {};

    for (const field of IMPORT_TARGET_FIELDS) {
      const explicit = mapping?.[field];
      if (explicit && headers.includes(explicit)) {
        resolved[field] = explicit;
        continue;
      }
      const autoDetected = headerByLowerName.get(field.toLowerCase());
      if (autoDetected) {
        resolved[field] = autoDetected;
      }
    }

    const missingRequired = REQUIRED_FIELDS.filter((f) => !resolved[f]);
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Could not map required columns: ${missingRequired.join(', ')}`,
      );
    }

    return resolved;
  }

  private buildRow(
    line: number,
    record: Record<string, string>,
    mapping: ColumnMapping,
    accountByName: Map<string, number>,
    categoryByName: Map<string, number>,
  ): ImportRow {
    const errors: string[] = [];
    const get = (field: ImportTargetField): string => {
      const header = mapping[field];
      return header ? (record[header] ?? '').trim() : '';
    };

    const row: ImportRow = { line, valid: false, errors };

    const accountName = get('account');
    if (!accountName) {
      errors.push('Account is required');
    } else {
      const accountId = accountByName.get(accountName.toLowerCase());
      if (accountId === undefined) {
        errors.push(`Account "${accountName}" was not found`);
      } else {
        row.accountId = accountId;
        row.accountName = accountName;
      }
    }

    const categoryName = get('category');
    if (categoryName) {
      const categoryId = categoryByName.get(categoryName.toLowerCase());
      if (categoryId === undefined) {
        errors.push(`Category "${categoryName}" was not found`);
      } else {
        row.categoryId = categoryId;
        row.categoryName = categoryName;
      }
    }

    const typeRaw = get('type').toUpperCase();
    if (!typeRaw) {
      errors.push('Type is required');
    } else if (typeRaw === TransactionType.TRANSFER) {
      errors.push('Transfers are not supported via CSV import');
    } else if (
      typeRaw !== TransactionType.INCOME &&
      typeRaw !== TransactionType.EXPENSE
    ) {
      errors.push(`Type "${typeRaw}" is invalid`);
    } else {
      row.type = typeRaw;
    }

    const amountRaw = get('amount');
    const amount = Number(amountRaw);
    if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
      errors.push('Amount must be a number greater than zero');
    } else {
      row.amount = Math.round(amount * 100) / 100;
    }

    const dateRaw = get('date');
    const parsedDate = dateRaw ? new Date(dateRaw) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      errors.push('Effective date is invalid');
    } else {
      row.effectiveDate = parsedDate.toISOString().split('T')[0];
    }

    const statusRaw = get('status').toUpperCase();
    if (!statusRaw) {
      row.status = TransactionStatus.CLEARED;
    } else if (
      statusRaw === TransactionStatus.PENDING ||
      statusRaw === TransactionStatus.CLEARED ||
      statusRaw === TransactionStatus.VOID
    ) {
      row.status = statusRaw;
    } else {
      errors.push(`Status "${statusRaw}" is invalid`);
    }

    const payee = get('payee');
    if (payee) row.payee = payee;
    const paymentMethod = get('paymentMethod');
    if (paymentMethod) row.paymentMethod = paymentMethod;
    const tags = get('tags');
    if (tags) row.tags = tags;
    const memo = get('memo');
    if (memo) row.memo = memo;

    row.valid = errors.length === 0;
    return row;
  }
}
