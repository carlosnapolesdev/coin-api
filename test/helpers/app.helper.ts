import * as http from 'http';
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ValidationError } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  server: http.Server;
  prisma: PrismaService;
}

export interface TestUser {
  token: string;
  id: number;
  email: string;
}

export async function createTestApp(): Promise<TestContext> {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const validationErrors: Record<string, string> = {};
        const flatten = (errs: ValidationError[], prefix = '') => {
          for (const err of errs) {
            const field = prefix ? `${prefix}.${err.property}` : err.property;
            if (err.constraints) {
              validationErrors[field] = Object.values(err.constraints)[0];
            }
            if (err.children?.length) flatten(err.children, field);
          }
        };
        flatten(errors);
        return new BadRequestException({
          message: 'Request validation failed',
          validationErrors,
        });
      },
    }),
  );

  await app.init();

  return {
    app,
    server: app.getHttpServer() as http.Server,
    prisma: app.get(PrismaService),
  };
}

export async function getFirstCurrencyId(server: http.Server): Promise<number> {
  const res = await request(server).get('/api/currencies');
  const currencies = res.body as Array<{ id: number }>;
  if (!currencies.length)
    throw new Error('No currencies found — run npm run seed first');
  return currencies[0].id;
}

export async function registerTestUser(
  server: http.Server,
  email: string,
  currencyId: number,
): Promise<TestUser> {
  const registerRes = await request(server)
    .post('/api/auth/register')
    .send({
      fullName: 'E2E Test User',
      email,
      password: 'Test1234',
      currencies: [{ currencyId, base: true }],
    })
    .expect(201);

  const loginRes = await request(server)
    .post('/api/auth/login')
    .send({ identifier: email, password: 'Test1234' })
    .expect(200);

  const registerBody = registerRes.body as { id: number };
  const loginBody = loginRes.body as { token: string };

  return {
    token: loginBody.token,
    id: registerBody.id,
    email,
  };
}

export async function cleanupUser(
  prisma: PrismaService,
  email: string,
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) return;

  const userId = user.id;

  await prisma.recurringTransaction.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({
    where: { account: { userId } },
  });
  await prisma.reconciliation.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.$executeRaw`UPDATE user_categories SET parent_id = NULL WHERE user_id = ${userId}`;
  await prisma.userCategory.deleteMany({ where: { userId } });
  await prisma.userCurrency.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}
