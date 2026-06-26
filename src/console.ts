import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CommandModule, CommandService } from 'nestjs-command';
import { PrismaModule } from './prisma/prisma.module';
import { SeedModule } from './seeds/seed.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    PrismaModule,
    SeedModule,
  ],
})
class CliAppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(CliAppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    await app.select(CommandModule).get(CommandService).exec();
    await app.close();
  } catch (error) {
    console.error(error);
    await app.close();
    process.exit(1);
  }
}

void bootstrap();
