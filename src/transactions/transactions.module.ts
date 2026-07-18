import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { SplitsService } from './splits.service';
import { ImportService } from './import/import.service';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [TagsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, SplitsService, ImportService],
  exports: [TransactionsService, SplitsService],
})
export class TransactionsModule {}
