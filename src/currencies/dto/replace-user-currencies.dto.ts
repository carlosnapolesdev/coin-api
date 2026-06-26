import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { AddUserCurrencyDto } from './add-user-currency.dto';

export class ReplaceUserCurrenciesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one currency selection is required' })
  @ValidateNested({ each: true })
  @Type(() => AddUserCurrencyDto)
  currencies: AddUserCurrencyDto[];
}
