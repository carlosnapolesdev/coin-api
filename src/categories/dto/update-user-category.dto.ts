import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateUserCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Category name must be at most 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Icon must be at most 50 characters' })
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
