import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

const HTTP_REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let validationErrors: Record<string, string> | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else {
        const bodyObj = body as Record<string, unknown>;
        if (bodyObj.validationErrors) {
          message = (bodyObj.message as string) ?? 'Request validation failed';
          validationErrors = bodyObj.validationErrors as Record<string, string>;
        } else {
          const raw = bodyObj.message;
          message =
            typeof raw === 'string'
              ? raw
              : ((bodyObj.error as string) ?? 'An error occurred');
        }
      }
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2002'
    ) {
      status = HttpStatus.CONFLICT;
      message = 'The request conflicts with an existing resource';
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
    }

    response.status(status).json({
      timestamp: new Date().toISOString(),
      status,
      error: HTTP_REASON_PHRASES[status] ?? 'Error',
      message,
      path: request.path,
      validationErrors,
    });
  }
}
