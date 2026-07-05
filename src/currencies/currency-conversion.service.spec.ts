import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyConversionService } from './currency-conversion.service';

const mockDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => value.toString(),
});

const USD_ID = BigInt(1);
const EUR_ID = BigInt(2);

const makeUserCurrency = (
  currencyId: bigint,
  opts: { isBase?: boolean; exchangeRate?: number } = {},
) => ({
  currencyId,
  userId: BigInt(1),
  exchangeRate: mockDecimal(opts.exchangeRate ?? 1),
  isBase: opts.isBase ?? false,
  isActive: true,
});

describe('CurrencyConversionService', () => {
  let service: CurrencyConversionService;

  const mockPrisma = {
    userCurrency: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyConversionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CurrencyConversionService>(CurrencyConversionService);
    jest.clearAllMocks();
  });

  describe('loadRates', () => {
    it('marks the base currency rate as 1 and keeps foreign rates as stored', async () => {
      mockPrisma.userCurrency.findMany.mockResolvedValue([
        makeUserCurrency(USD_ID, { isBase: true, exchangeRate: 1 }),
        makeUserCurrency(EUR_ID, { exchangeRate: 1.1 }),
      ]);

      const result = await service.loadRates(1);

      expect(result.baseCurrencyId).toBe(1);
      expect(result.rates.get(1)).toBe(1);
      expect(result.rates.get(2)).toBe(1.1);
    });

    it('returns a null base currency id when the user has none marked as base', async () => {
      mockPrisma.userCurrency.findMany.mockResolvedValue([]);

      const result = await service.loadRates(1);

      expect(result.baseCurrencyId).toBeNull();
      expect(result.rates.size).toBe(0);
    });
  });

  describe('convertToBase', () => {
    it('returns the amount unchanged for the base currency', () => {
      const rates = { baseCurrencyId: 1, rates: new Map([[1, 1]]) };
      expect(service.convertToBase(100, 1, rates)).toBe(100);
    });

    it('divides by the exchange rate for a foreign currency (rate = foreign units per base unit)', () => {
      const rates = {
        baseCurrencyId: 1,
        rates: new Map([
          [1, 1],
          [2, 1.1],
        ]),
      };
      expect(service.convertToBase(100, 2, rates)).toBeCloseTo(90.909, 3);
    });

    it('returns null when there is no rate for the currency', () => {
      const rates = { baseCurrencyId: 1, rates: new Map([[1, 1]]) };
      expect(service.convertToBase(100, 3, rates)).toBeNull();
    });
  });
});
