import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../common/decorators';
import { CategoryType } from '../common/enums';
import { CategoriesService } from './categories.service';
import { CreateUserCategoryDto, UpdateUserCategoryDto } from './dto';
import type { UserCategoryResponseDto } from './dto';

@Controller('users/me/categories')
export class UserCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  listUserCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
    @Query('type', new ParseEnumPipe(CategoryType, { optional: true }))
    type?: CategoryType,
  ): Promise<UserCategoryResponseDto[]> {
    return this.categoriesService.getUserCategories(
      user.id,
      includeInactive === 'true',
      type,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createUserCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserCategoryDto,
  ): Promise<UserCategoryResponseDto> {
    return this.categoriesService.createUserCategory(user.id, dto);
  }

  @Patch(':categoryId')
  updateUserCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() dto: UpdateUserCategoryDto,
  ): Promise<UserCategoryResponseDto> {
    return this.categoriesService.updateUserCategory(user.id, categoryId, dto);
  }

  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUserCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId', ParseIntPipe) categoryId: number,
  ): Promise<void> {
    return this.categoriesService.deleteUserCategory(user.id, categoryId);
  }
}
