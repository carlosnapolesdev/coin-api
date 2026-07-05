import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TransactionsService } from './transactions.service';
import { ImportService } from './import/import.service';
import { ImportCommitDto } from './import/dto/import-commit.dto';
import type { ColumnMapping, ImportPreviewResult } from './import/import.types';
import {
  CreateTransactionDto,
  QueryTransactionsDto,
  UpdateTransactionDto,
} from './dto';
import type { TransactionResponseDto } from './dto';
import type { PaginatedResponse } from '../common/dto';

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

@Controller('users/me/transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly importService: ImportService,
  ) {}

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

  @Get('search')
  searchTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryTransactionsDto,
  ): Promise<PaginatedResponse<TransactionResponseDto>> {
    return this.transactionsService.searchTransactions(user.id, query);
  }

  @Get('export')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryTransactionsDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.transactionsService.exportCsv(user.id, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="transactions.csv"',
    );
    res.send(csv);
  }

  @Post('import/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_FILE_BYTES },
    }),
  )
  previewImport(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('mapping') mappingRaw?: string,
  ): Promise<ImportPreviewResult> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    const mapping = this.parseMapping(mappingRaw);
    return this.importService.previewCsv(user.id, file.buffer, mapping);
  }

  @Post('import/commit')
  commitImport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportCommitDto,
  ): Promise<{ created: number }> {
    return this.importService.commitImport(user.id, dto.rows);
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

  private parseMapping(mappingRaw?: string): ColumnMapping | undefined {
    if (!mappingRaw) return undefined;
    try {
      return JSON.parse(mappingRaw) as ColumnMapping;
    } catch {
      throw new BadRequestException('Invalid column mapping JSON');
    }
  }
}
