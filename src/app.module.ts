import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { TagsModule } from './tags/tags.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';
import { ReportsModule } from './reports/reports.module';
import { RecurringModule } from './recurring/recurring.module';
import { HealthModule } from './health/health.module';
import { ReconciliationsModule } from './reconciliations/reconciliations.module';
import { envValidationSchema } from './config/env.validation';
import { buildPinoHttpOptions } from './config/logger';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRoot({
      pinoHttp: buildPinoHttpOptions(process.env.NODE_ENV),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    MailModule,
    StorageModule,
    AttachmentsModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    CurrenciesModule,
    TagsModule,
    TransactionsModule,
    BudgetsModule,
    GoalsModule,
    ReportsModule,
    RecurringModule,
    ReconciliationsModule,
    HealthModule,
    NotificationsModule,
  ],
})
export class AppModule {}
