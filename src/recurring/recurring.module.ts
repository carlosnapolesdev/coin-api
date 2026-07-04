import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TransactionsModule } from '../transactions/transactions.module';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';
import { RecurringScheduler } from './recurring.scheduler';

@Module({
  imports: [ScheduleModule.forRoot(), TransactionsModule],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringScheduler],
})
export class RecurringModule {}
