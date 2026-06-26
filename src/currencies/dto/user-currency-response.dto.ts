export interface UserCurrencyResponseDto {
  currencyId: number;
  code: string;
  name: string;
  symbol: string | null;
  exchangeRate: number;
  base: boolean;
  active: boolean;
}
