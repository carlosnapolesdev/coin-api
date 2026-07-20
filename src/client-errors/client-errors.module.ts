import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientErrorsController } from './client-errors.controller';
import { ClientErrorsService } from './client-errors.service';
import { ClientErrorsScheduler } from './client-errors.scheduler';

@Module({
  imports: [JwtModule.register({}), ScheduleModule.forRoot()],
  controllers: [ClientErrorsController],
  providers: [ClientErrorsService, ClientErrorsScheduler],
  exports: [ClientErrorsService],
})
export class ClientErrorsModule {}
