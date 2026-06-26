import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
} from 'class-validator';

export class AddUserCurrencyDto {
  @IsNotEmpty({ message: 'Currency id is required' })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  currencyId: number;

  @IsNotEmpty({ message: 'Base flag is required' })
  @IsBoolean()
  base: boolean;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 6 },
    { message: 'Exchange rate must have at most 6 decimal places' },
  )
  @Min(0.000001, { message: 'Exchange rate must be greater than 0' })
  exchangeRate?: number;
}
