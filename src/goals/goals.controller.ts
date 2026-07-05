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
import { GoalsService } from './goals.service';
import { CreateGoalDto, UpdateGoalDto } from './dto';
import type { GoalResponseDto } from './dto';

@Controller('users/me/goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  listGoals(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GoalResponseDto[]> {
    return this.goalsService.listGoals(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    return this.goalsService.createGoal(user.id, dto);
  }

  @Patch(':goalId')
  updateGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseIntPipe) goalId: number,
    @Body() dto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    return this.goalsService.updateGoal(user.id, goalId, dto);
  }

  @Delete(':goalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseIntPipe) goalId: number,
  ): Promise<void> {
    return this.goalsService.deleteGoal(user.id, goalId);
  }
}
