import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionStatus, TransactionType } from '../../common/enums';

export class CreateTransactionDto {
  @IsNotEmpty({ message: 'Account is required' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinationAccountId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 6 },
    { message: 'Exchange rate must have at most 6 decimal places' },
  )
  @Min(0.000001, { message: 'Exchange rate must be greater than 0' })
  exchangeRate?: number;

  @IsNotEmpty({ message: 'Transaction type is required' })
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNotEmpty({ message: 'Amount is required' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Amount must have at most 2 decimal places' },
  )
  @Min(0.01, { message: 'Amount must be greater than zero' })
  amount: number;

  @IsNotEmpty({ message: 'Effective date is required' })
  @IsDateString({}, { message: 'Effective date must be a valid date' })
  effectiveDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Payee must be at most 255 characters' })
  payee?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Payment method must be at most 100 characters' })
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  tags?: string;
}
