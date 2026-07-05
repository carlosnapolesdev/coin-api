import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [AccountsModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
