import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateRecurringDto } from './create-recurring.dto';

export class UpdateRecurringDto extends PartialType(CreateRecurringDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
