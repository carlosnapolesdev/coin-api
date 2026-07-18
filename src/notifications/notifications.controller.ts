import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { NotificationsService } from './notifications.service';
import type { NotificationResponseDto } from './dto';

@Controller('users/me/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('unread') unread?: string,
  ): Promise<NotificationResponseDto[]> {
    return this.notificationsService.list(user.id, unread === 'true');
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    const updated = await this.notificationsService.markAllRead(user.id);
    return { updated };
  }
}
