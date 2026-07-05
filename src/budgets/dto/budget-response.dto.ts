export interface BudgetResponseDto {
  id: number;
  categoryId: number;
  categoryName: string | null;
  amount: number;
  period: string;
  startDate: string;
  spent: number;
  remaining: number;
  percentUsed: number;
  active: boolean;
}
