import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { CurrenciesService } from './currencies.service';
import type { CurrencyResponseDto } from './dto/currency-response.dto';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  @Public()
  listCurrencies(): Promise<CurrencyResponseDto[]> {
    return this.currenciesService.getAvailableCurrencies();
  }
}
