import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { ClientErrorsScheduler } from './client-errors.scheduler';
import { ClientErrorsService } from './client-errors.service';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

@Controller('client-errors')
export class ClientErrorsController {
  private readonly logger = new Logger(ClientErrorsController.name);

  constructor(
    private readonly service: ClientErrorsService,
    private readonly scheduler: ClientErrorsScheduler,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async report(
    @Body() dto: ReportClientErrorDto,
    @Req() req: Request,
  ): Promise<void> {
    const { isNew, fingerprint } = await this.service.record(
      dto,
      this.resolveUserId(req),
    );
    if (isNew) {
      // Deliberadamente sin await: un fallo de Resend no puede degradar ni
      // ralentizar justo la app que se está instrumentando.
      void this.scheduler.notifyNew(fingerprint).catch((error: unknown) => {
        this.logger.error(`Immediate alert failed: ${String(error)}`);
      });
    }
  }

  /**
   * El endpoint es público a propósito (cubre login y registro). Un token
   * inválido no rechaza el reporte: solo deja el userId vacío. Nunca se lee
   * del cuerpo, que es falsificable.
   */
  private resolveUserId(req: Request): bigint | null {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      const payload = this.jwt.verify<{ sub?: string }>(header.slice(7), {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      // Tras la Tarea 3 el sub es el id, así que no hace falta consultar la
      // base para resolverlo.
      return payload.sub ? BigInt(payload.sub) : null;
    } catch {
      return null;
    }
  }
}
