import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const RETENTION_DAYS = 90;
const DIGEST_WINDOW_HOURS = 24;
const IMMEDIATE_COOLDOWN_HOURS = 1;

interface DigestRow {
  context: string;
  errorName: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/**
 * `context` y `errorName` llegan por un endpoint público sin autenticar, así
 * que son texto controlado por quien envíe la petición. Sin escapar, cualquiera
 * puede inyectar marcado —enlaces de phishing incluidos— en el correo que
 * recibe el administrador.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fecha legible en el correo. Se incluye el nombre de la zona porque el
 * servidor puede correr en UTC y quien lo lee no: sin etiqueta, una hora suelta
 * es ambigua.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

function formatSeen(date: Date): string {
  return DATE_FORMAT.format(date);
}

function pluralizeTimes(count: number): string {
  return count === 1 ? '1 vez' : `${count} veces`;
}

/**
 * El asunto es una cabecera, no HTML: escapar no sirve y un salto de línea
 * abriría la puerta a inyección de cabeceras. Se quitan controles y marcado, se
 * colapsa el espacio y se recorta.
 */
function plainSubjectPart(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

@Injectable()
export class ClientErrorsScheduler {
  private readonly logger = new Logger(ClientErrorsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get recipient(): string | undefined {
    return this.config.get<string>('CLIENT_ERRORS_DIGEST_TO');
  }

  private hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 3_600_000);
  }

  /**
   * Tope global de 1 email/hora: si un deploy rompe treinta cosas a la vez, no
   * deben salir treinta correos. Lo que queda capado no se pierde — entra en el
   * digest diario, que cubre toda la ventana.
   */
  async notifyNew(fingerprint: string): Promise<void> {
    const to = this.recipient;
    if (!to) return;

    const recent = await this.prisma.clientError.count({
      where: { notifiedAt: { gte: this.hoursAgo(IMMEDIATE_COOLDOWN_HOURS) } },
    });
    if (recent > 0) return;

    const row = await this.prisma.clientError.findUnique({
      where: { fingerprint },
      select: { context: true, errorName: true },
    });
    if (!row) return;

    const html = `<p>Nuevo error en Crecik: <strong>${escapeHtml(row.errorName)}</strong> en <code>${escapeHtml(row.context)}</code>.</p>`;
    const subject = `Crecik: nuevo error (${plainSubjectPart(row.context)})`;
    await this.mail.send(to, subject, html);
    await this.prisma.clientError.update({
      where: { fingerprint },
      data: { notifiedAt: new Date() },
    });
  }

  @Cron('0 7 * * *')
  async runDaily(): Promise<void> {
    await this.sendDigest();
    const removed = await this.prune();
    if (removed > 0) {
      this.logger.log(`Pruned ${removed} client error rows`);
    }
  }

  async sendDigest(): Promise<void> {
    const to = this.recipient;

    const rows: DigestRow[] = await this.prisma.clientError.findMany({
      where: { lastSeenAt: { gte: this.hoursAgo(DIGEST_WINDOW_HOURS) } },
      // Solo estas columnas: message, stack y url no pueden salir del VPS.
      select: {
        context: true,
        errorName: true,
        count: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
      orderBy: { count: 'desc' },
    });

    // Un email diario de "0 errores" solo entrena a ignorarlos.
    if (rows.length === 0) return;
    if (!to) {
      this.logger.warn(
        `CLIENT_ERRORS_DIGEST_TO is not set — ${rows.length} grouped errors not reported`,
      );
      return;
    }

    const items = rows
      .map(
        (r) =>
          `<li><code>${escapeHtml(r.context)}</code> — <strong>${escapeHtml(r.errorName)}</strong>: ${pluralizeTimes(r.count)} (desde ${formatSeen(r.firstSeenAt)}, última ${formatSeen(r.lastSeenAt)})</li>`,
      )
      .join('');
    const html = `<p>Errores de cliente en las últimas ${DIGEST_WINDOW_HOURS} h:</p><ul>${items}</ul>`;

    await this.mail.send(
      to,
      `Crecik: ${rows.length} error(es) de cliente`,
      html,
    );
  }

  async prune(): Promise<number> {
    const { count } = await this.prisma.clientError.deleteMany({
      where: { lastSeenAt: { lt: this.hoursAgo(RETENTION_DAYS * 24) } },
    });
    return count;
  }
}
