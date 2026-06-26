import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

interface CurrencyApiEntry {
  code: string;
  name: string;
  symbol?: string | null;
}

interface CurrencyApiResponse {
  currencies: CurrencyApiEntry[];
}

const AAAPIS_URL = 'https://aaapis.com/api/v1/info/currencies/';

@Injectable()
export class CurrencySeedService {
  private readonly logger = new Logger(CurrencySeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async seedCurrencies(): Promise<number> {
    const count = await this.prisma.currency.count();
    if (count > 0) {
      this.logger.log('Currency seed skipped: table already contains data');
      return 0;
    }

    const token = this.config.get<string>('AAAPIS_TOKEN', '');
    if (!token) {
      throw new Error('AAAPIS_TOKEN must be set in .env to seed currencies');
    }

    this.logger.log('Fetching currencies from aaapis.com...');
    const response = await firstValueFrom(
      this.httpService.get<CurrencyApiResponse>(AAAPIS_URL, {
        headers: { Authorization: `Token ${token}` },
      }),
    );

    const currencies = response.data?.currencies;
    if (!currencies?.length) {
      throw new Error('Currency provider returned an empty response');
    }

    const now = new Date();
    const records = currencies
      .filter((c) => c.code?.trim() && c.name?.trim())
      .map((c) => ({
        code: c.code.trim().toUpperCase(),
        name: c.name.trim(),
        symbol: c.symbol?.trim() || null,
        createdAt: now,
      }));

    await this.prisma.currency.createMany({
      data: records,
      skipDuplicates: true,
    });
    this.logger.log(`Seeded ${records.length} currencies`);
    return records.length;
  }
}
