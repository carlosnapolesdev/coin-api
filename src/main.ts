import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
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
        return new BadRequestException({ message: 'Request validation failed', validationErrors });
      },
    }),
  );

  const port = process.env.PORT ?? 8080;
  await app.listen(port);
}
bootstrap();
