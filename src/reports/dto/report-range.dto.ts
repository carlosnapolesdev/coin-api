import { IsOptional, IsString } from 'class-validator';

export class ReportRangeDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
