import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SplitItemDto {
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Amount must have at most 2 decimal places' },
  )
  @Min(0.01, { message: 'Amount must be greater than zero' })
  amount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  categoryId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;
}

export class SetSplitsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitItemDto)
  splits!: SplitItemDto[];
}
