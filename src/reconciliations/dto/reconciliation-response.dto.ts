export interface ReconciliationResponseDto {
  id: number;
  accountId: number;
  statementDate: string;
  statementBalance: number;
  clearedBalance: number;
  difference: number;
  isCompleted: boolean;
  completedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ReconciliationSummaryDto {
  id: number;
  accountId: number;
  statementDate: string;
  statementBalance: number;
  clearedBalance: number;
  difference: number;
  isCompleted: boolean;
  clearedCount: number;
  pendingCount: number;
}
