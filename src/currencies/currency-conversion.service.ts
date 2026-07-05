import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CurrencyRatesMap {
  baseCurrencyId: number | null;
  rates: Map<number, number>;
}

@Injectable()
export class CurrencyConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async loadRates(userId: number): Promise<CurrencyRatesMap> {
    const userCurrencies = await this.prisma.userCurrency.findMany({
      where: { userId: BigInt(userId), isActive: true },
    });

    const base = userCurrencies.find((uc) => uc.isBase);
    const baseCurrencyId = base ? Number(base.currencyId) : null;

    const rates = new Map<number, number>();
    for (const uc of userCurrencies) {
      const currencyId = Number(uc.currencyId);
      rates.set(
        currencyId,
        currencyId === baseCurrencyId ? 1 : (uc.exchangeRate?.toNumber() ?? 1),
      );
    }

    return { baseCurrencyId, rates };
  }

  // exchangeRate is defined as "1 base unit = exchangeRate units of the foreign currency",
  // so converting back to base means dividing by the rate.
  convertToBase(
    amount: number,
    currencyId: number,
    { baseCurrencyId, rates }: CurrencyRatesMap,
  ): number | null {
    if (currencyId === baseCurrencyId) return amount;
    const rate = rates.get(currencyId);
    if (!rate) return null;
    return amount / rate;
  }
}
