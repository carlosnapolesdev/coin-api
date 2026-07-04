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
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { RecurringService } from './recurring.service';
import { RecurringScheduler } from './recurring.scheduler';
import { CreateRecurringDto, UpdateRecurringDto } from './dto';
import type { RecurringResponseDto } from './dto';
import type { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';

@Controller('users/me/recurring')
export class RecurringController {
  constructor(
    private readonly recurringService: RecurringService,
    private readonly recurringScheduler: RecurringScheduler,
  ) {}

  @Get()
  listRecurring(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecurringResponseDto[]> {
    return this.recurringService.listRecurring(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRecurringDto,
  ): Promise<RecurringResponseDto> {
    return this.recurringService.createRecurring(user.id, dto);
  }

  @Patch(':id')
  updateRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecurringDto,
  ): Promise<RecurringResponseDto> {
    return this.recurringService.updateRecurring(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.recurringService.deleteRecurring(user.id, id);
  }

  @Post(':id/run')
  runNow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TransactionResponseDto> {
    return this.recurringScheduler.runNow(user.id, id);
  }
}
