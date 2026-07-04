export interface MonthlyPointDto {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface CategoryTotalDto {
  categoryId: number | null;
  categoryName: string;
  total: number;
}

export interface NetWorthPointDto {
  month: string;
  balance: number;
}
