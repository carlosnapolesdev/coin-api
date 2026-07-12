import type { TransactionStatus, TransactionType } from '../../common/enums';

export interface TransactionResponseDto {
  id: number;
  accountId: number | null;
  accountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  type: TransactionType;
  amount: number;
  effectiveDate: string;
  payee: string | null;
  paymentMethod: string | null;
  memo: string | null;
  status: TransactionStatus;
  tags: string | null;
  transferAccountId: number | null;
  transferIn: boolean | null;
  exchangeRate: number | null;
  balance: number | null;
  attachmentCount: number;
  splitCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}
