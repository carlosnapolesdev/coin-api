import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportClientErrorDto } from './dto/report-client-error.dto';
import { computeFingerprint } from './fingerprint';

export interface RecordResult {
  isNew: boolean;
  fingerprint: string;
}

@Injectable()
export class ClientErrorsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    dto: ReportClientErrorDto,
    userId: bigint | null,
  ): Promise<RecordResult> {
    const fingerprint = computeFingerprint(
      dto.context,
      dto.errorName,
      dto.stack,
    );
    const occurrences = dto.occurrences ?? 1;

    // Upsert atómico en una sentencia: dos reportes del mismo fingerprint
    // pueden llegar a la vez y un read-modify-write perdería uno.
    // La muestra (message/stack/url) se sobrescribe con la más reciente.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO client_errors
        (fingerprint, context, error_name, message, stack, url,
         user_agent, app_version, user_id, count, first_seen_at, last_seen_at)
      VALUES
        (${fingerprint}, ${dto.context}, ${dto.errorName}, ${dto.message},
         ${dto.stack ?? null}, ${dto.url ?? null}, ${dto.userAgent ?? null},
         ${dto.appVersion ?? null}, ${userId}, ${occurrences}, NOW(), NOW())
      ON CONFLICT (fingerprint) DO UPDATE SET
        count = client_errors.count + ${occurrences},
        last_seen_at = NOW(),
        message = EXCLUDED.message,
        stack = EXCLUDED.stack,
        url = EXCLUDED.url,
        app_version = EXCLUDED.app_version
      RETURNING count`;

    return { isNew: rows[0].count === occurrences, fingerprint };
  }
}
