import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CategoryType } from '../../common/enums';

export class CreateUserCategoryDto {
  @IsNotEmpty({ message: 'Category name is required' })
  @IsString()
  @MaxLength(100, { message: 'Category name must be at most 100 characters' })
  name: string;

  @IsNotEmpty({ message: 'Category type is required' })
  @IsEnum(CategoryType)
  type: CategoryType;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Icon must be at most 50 characters' })
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;
}
