import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ReportsService } from './reports.service';
import { ReportRangeDto } from './dto';
import type {
  MonthlyPointDto,
  CategoryTotalDto,
  NetWorthPointDto,
} from './dto';

@Controller('users/me/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('income-expense')
  incomeExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Query() range: ReportRangeDto,
  ): Promise<MonthlyPointDto[]> {
    return this.reportsService.incomeVsExpense(user.id, range);
  }

  @Get('categories')
  categories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() range: ReportRangeDto,
  ): Promise<CategoryTotalDto[]> {
    return this.reportsService.categoryBreakdown(user.id, range);
  }

  @Get('net-worth')
  netWorth(
    @CurrentUser() user: AuthenticatedUser,
    @Query() range: ReportRangeDto,
  ): Promise<NetWorthPointDto[]> {
    return this.reportsService.netWorthTrend(user.id, range);
  }
}
