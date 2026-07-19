import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationError } from 'class-validator';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { resolveCorsOrigin } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Behind the reverse proxy (external `web` network) the client IP arrives
  // via X-Forwarded-For; without this the throttler sees every request as
  // coming from the proxy's IP.
  app.set('trust proxy', 1);

  app.useLogger(app.get(Logger));

  app.use(helmet());

  app.enableCors({
    origin: resolveCorsOrigin(process.env.CORS_ORIGIN, process.env.NODE_ENV),
    credentials: true,
  });

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

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Crecik API')
      .setDescription('Personal finance management REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 8080;
  await app.listen(port);
}
void bootstrap();
