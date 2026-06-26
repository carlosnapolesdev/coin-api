import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AccountTemplate } from '../../common/enums/account-template.enum';
import { AccountType } from '../../common/enums/account-type.enum';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Account name must be at most 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'Institution must be at most 150 characters' })
  institution?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Account number must be at most 50 characters' })
  accountNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  currencyId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Account group must be at most 100 characters' })
  groupName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  startBalance?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Icon must be at most 50 characters' })
  icon?: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsEnum(AccountTemplate)
  defaultTemplate?: AccountTemplate;

  @IsOptional()
  @IsBoolean()
  excludeFromAccountSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  outlineIntoSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeFromBudget?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeFromAnyReports?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  overdraftAt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  maximumBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Checkbook 1 must be non-negative' })
  checkbook1?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Checkbook 2 must be non-negative' })
  checkbook2?: number;
}
