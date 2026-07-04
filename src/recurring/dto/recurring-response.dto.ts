import type { RecurrenceFrequency, TransactionType } from '../../common/enums';

export interface RecurringResponseDto {
  id: number;
  accountId: number;
  accountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  destinationAccountId: number | null;
  destinationAccountName: string | null;
  type: TransactionType;
  amount: number;
  frequency: RecurrenceFrequency;
  interval: number;
  nextRunDate: string;
  lastRunDate: string | null;
  endDate: string | null;
  payee: string | null;
  memo: string | null;
  tags: string | null;
  isActive: boolean;
}
