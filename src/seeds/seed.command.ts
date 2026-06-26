import { Injectable, Logger } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { CurrencySeedService } from './currency-seed.service';
import { CategorySeedService } from './category-seed.service';

@Injectable()
export class SeedCommand {
  private readonly logger = new Logger(SeedCommand.name);

  constructor(
    private readonly currencySeedService: CurrencySeedService,
    private readonly categorySeedService: CategorySeedService,
  ) {}

  @Command({
    command: 'seed',
    describe: 'Seed the database with currencies, categories and translations',
  })
  async run(): Promise<void> {
    this.logger.log('Starting database seed...');

    await this.currencySeedService.seedCurrencies();
    await this.categorySeedService.seedCategories();
    await this.categorySeedService.seedTranslations();

    this.logger.log('Seed completed successfully');
  }
}
