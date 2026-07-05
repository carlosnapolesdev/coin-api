import type { TransactionStatus, TransactionType } from '../../common/enums';

export const IMPORT_TARGET_FIELDS = [
  'date',
  'account',
  'category',
  'type',
  'amount',
  'payee',
  'paymentMethod',
  'status',
  'tags',
  'memo',
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export type ColumnMapping = Partial<Record<ImportTargetField, string>>;

export interface ImportRow {
  line: number;
  valid: boolean;
  errors: string[];
  accountId?: number;
  accountName?: string;
  categoryId?: number;
  categoryName?: string;
  type?: TransactionType;
  amount?: number;
  effectiveDate?: string;
  payee?: string;
  paymentMethod?: string;
  status?: TransactionStatus;
  tags?: string;
  memo?: string;
}

export interface ImportError {
  line: number;
  message: string;
}

export interface ImportPreviewResult {
  rows: ImportRow[];
  errors: ImportError[];
}
