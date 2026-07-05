import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { ImportService } from './import/import.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, ImportService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
