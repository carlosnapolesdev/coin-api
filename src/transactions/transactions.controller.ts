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
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto, UpdateTransactionDto } from './dto';
import type { TransactionResponseDto } from './dto';

@Controller('users/me/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountId', new ParseIntPipe({ optional: true }))
    accountId?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<TransactionResponseDto[]> {
    return this.transactionsService.getUserTransactions(
      user.id,
      accountId,
      from,
      to,
    );
  }

  @Get(':transactionId')
  getTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', ParseIntPipe) transactionId: number,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.getTransaction(user.id, transactionId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createTransaction(user.id, dto);
  }

  @Patch(':transactionId')
  updateTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', ParseIntPipe) transactionId: number,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.updateTransaction(
      user.id,
      transactionId,
      dto,
    );
  }

  @Delete(':transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', ParseIntPipe) transactionId: number,
  ): Promise<void> {
    return this.transactionsService.deleteTransaction(user.id, transactionId);
  }
}
