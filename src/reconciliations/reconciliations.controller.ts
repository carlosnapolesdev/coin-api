import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ReconciliationsService } from './reconciliations.service';
import { OpenReconciliationDto } from './dto';
import type {
  ReconciliationResponseDto,
  ReconciliationSummaryDto,
} from './dto';

@Controller('users/me/accounts/:accountId/reconciliations')
export class ReconciliationsController {
  constructor(
    private readonly reconciliationsService: ReconciliationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', ParseIntPipe) accountId: number,
    @Body() dto: OpenReconciliationDto,
  ): Promise<ReconciliationResponseDto> {
    return this.reconciliationsService.open(user.id, accountId, dto);
  }

  @Get(':reconciliationId')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reconciliationId', ParseIntPipe) reconciliationId: number,
  ): Promise<ReconciliationSummaryDto> {
    return this.reconciliationsService.getSummary(user.id, reconciliationId);
  }

  @Post(':reconciliationId/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reconciliationId', ParseIntPipe) reconciliationId: number,
  ): Promise<ReconciliationResponseDto> {
    return this.reconciliationsService.complete(user.id, reconciliationId);
  }
}
