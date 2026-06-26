import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.use(helmet());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').filter(Boolean) ?? true,
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
      .setTitle('Coinflow API')
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
