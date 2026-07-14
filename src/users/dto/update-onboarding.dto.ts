import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateOnboardingDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coachSeen?: string[];

  @IsOptional()
  @IsBoolean()
  checklistDismissed?: boolean;

  @IsOptional()
  @IsBoolean()
  celebrationShown?: boolean;

  @IsOptional()
  @IsBoolean()
  reportsVisited?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  tourVersion?: number;
}
