import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class UserCurrencySelectionDto {
  @IsNotEmpty({ message: 'Currency id is required' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  currencyId: number;

  @IsNotEmpty({ message: 'Base flag is required' })
  @IsBoolean()
  base: boolean;

  @IsOptional()
  @IsPositive({ message: 'Exchange rate must be greater than 0' })
  @Type(() => Number)
  exchangeRate?: number;
}

export class RegisterDto {
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString()
  @Length(1, 100, { message: 'Full name must be at most 100 characters' })
  fullName: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must have a valid format' })
  @Length(1, 150, { message: 'Email must be at most 150 characters' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @Length(8, 72, { message: 'Password must be between 8 and 72 characters' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number',
  })
  password: string;

  @IsOptional()
  @IsString()
  @Length(0, 50, { message: 'Username must be at most 50 characters' })
  username?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10, { message: 'Language must be at most 10 characters' })
  language?: string;

  @IsNotEmpty({ message: 'Currencies are required' })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Currencies must include at least one selection',
  })
  @ValidateNested({ each: true })
  @Type(() => UserCurrencySelectionDto)
  currencies: UserCurrencySelectionDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  categoryIds?: number[];
}
