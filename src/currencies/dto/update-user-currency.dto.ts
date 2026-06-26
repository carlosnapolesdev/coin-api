import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateUserCurrencyDto {
  @IsOptional()
  @IsBoolean()
  base?: boolean;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 6 },
    { message: 'Exchange rate must have at most 6 decimal places' },
  )
  @Min(0.000001, { message: 'Exchange rate must be greater than 0' })
  exchangeRate?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
