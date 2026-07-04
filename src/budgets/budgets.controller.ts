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
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto, UpdateBudgetDto } from './dto';
import type { BudgetResponseDto } from './dto';

@Controller('users/me/budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  listBudgets(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BudgetResponseDto[]> {
    return this.budgetsService.listBudgets(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBudgetDto,
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.createBudget(user.id, dto);
  }

  @Patch(':budgetId')
  updateBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('budgetId', ParseIntPipe) budgetId: number,
    @Body() dto: UpdateBudgetDto,
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.updateBudget(user.id, budgetId, dto);
  }

  @Delete(':budgetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('budgetId', ParseIntPipe) budgetId: number,
  ): Promise<void> {
    return this.budgetsService.deleteBudget(user.id, budgetId);
  }
}
