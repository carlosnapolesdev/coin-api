export interface CurrencyNetWorthDto {
  code: string;
  symbol: string;
  net: number;
  netInBase: number | null;
}

export interface NetWorthSummaryDto {
  baseCurrencyCode: string | null;
  totalInBase: number;
  byCurrency: CurrencyNetWorthDto[];
  unconvertibleCurrencies: string[];
}
