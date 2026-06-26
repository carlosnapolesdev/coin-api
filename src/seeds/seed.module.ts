import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CommandModule } from 'nestjs-command';
import { CurrencySeedService } from './currency-seed.service';
import { CategorySeedService } from './category-seed.service';
import { SeedCommand } from './seed.command';

@Module({
  imports: [CommandModule, HttpModule],
  providers: [CurrencySeedService, CategorySeedService, SeedCommand],
})
export class SeedModule {}
