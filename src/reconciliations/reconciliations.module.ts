import { Module } from '@nestjs/common';
import { ReconciliationsController } from './reconciliations.controller';
import { ReconciliationsService } from './reconciliations.service';

@Module({
  controllers: [ReconciliationsController],
  providers: [ReconciliationsService],
  exports: [ReconciliationsService],
})
export class ReconciliationsModule {}
