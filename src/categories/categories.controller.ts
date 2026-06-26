import { Controller, Get, ParseEnumPipe, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { CategoryType } from '../common/enums';
import { CategoriesService } from './categories.service';
import type { CategoryCatalogResponseDto } from './dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Public()
  listCategories(
    @Query('language') language?: string,
    @Query('type', new ParseEnumPipe(CategoryType, { optional: true }))
    type?: CategoryType,
  ): Promise<CategoryCatalogResponseDto[]> {
    return this.categoriesService.getCategoryCatalog(language, type);
  }
}
