import { Module } from '@nestjs/common';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { UserCurrenciesController } from './user-currencies.controller';

@Module({
  controllers: [CurrenciesController, UserCurrenciesController],
  providers: [CurrenciesService, CurrencyConversionService],
  exports: [CurrenciesService, CurrencyConversionService],
})
export class CurrenciesModule {}
