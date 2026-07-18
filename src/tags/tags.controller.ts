import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TagsService } from './tags.service';
import type { TagResponseDto } from './dto/tag-response.dto';
import { RenameTagDto } from './dto/rename-tag.dto';

@Controller('users/me/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  // Lists the caller's tags together with a per-tag usage count. The usage
  // count is computed with a `tags CONTAINS name` query, which is a substring
  // match: a tag named `food` will also count transactions tagged `seafood`.
  // This matches the Task 3 brief literally and is documented in the service.
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<TagResponseDto[]> {
    return this.tagsService.list(user.id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameTagDto,
  ): Promise<TagResponseDto> {
    return this.tagsService.rename(user.id, id, dto.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.tagsService.remove(user.id, id);
  }
}
