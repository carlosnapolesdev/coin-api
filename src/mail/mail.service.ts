import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { buildMailConfig, type MailConfig } from './mail.config';

/** Alternativa en texto plano derivada del HTML, para correos multiparte. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|li|ul|ol|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config: MailConfig;
  private readonly client: Resend | null;

  constructor(configService: ConfigService) {
    this.config = buildMailConfig(configService);
    this.client = this.config.apiKey ? new Resend(this.config.apiKey) : null;
    if (!this.client) {
      // Avisa al arrancar en vez de fallar en silencio en el primer envío.
      this.logger.warn(
        'RESEND_API_KEY is not set — outgoing email is disabled',
      );
    }
  }

  /**
   * Devuelve false si el envío falló, sin lanzar: el llamador decide si eso
   * degrada su operación. Resend resuelve con { data, error } en vez de lanzar,
   * así que comprobar el await no basta.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<boolean> {
    if (!this.client) {
      this.logger.warn(`Email to ${to} not sent: transport disabled`);
      return false;
    }

    const { data, error } = await this.client.emails.send({
      from: this.config.from,
      to: [to],
      subject,
      html,
      // Nunca se envía solo-HTML: los filtros lo penalizan y un dominio sin
      // reputación acaba en spam. Si el llamador no da texto, se deriva.
      text: text ?? htmlToPlainText(html),
    });

    if (error) {
      this.logger.error(`Email to ${to} failed: ${error.message}`);
      return false;
    }

    this.logger.log(`Email to ${to} sent (${data?.id ?? 'no id'})`);
    return true;
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const html = [
      '<p>Hola,</p>',
      '<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de Crecik.</p>',
      `<p><a href="${resetUrl}">Restablecer mi contraseña</a></p>`,
      `<p>Si el enlace no funciona, copia esta dirección en tu navegador:<br>${resetUrl}</p>`,
      '<p>El enlace caduca en 1 hora y solo puede usarse una vez. Si no has sido tú, ignora este correo: tu contraseña no cambiará.</p>',
      '<p>— El equipo de Crecik</p>',
    ].join('');
    // Texto explícito en vez de derivado: la versión en texto plano es la que
    // leen los filtros y conviene que se sostenga por sí sola.
    const text = [
      'Hola,',
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Crecik.',
      '',
      `Abre esta dirección para elegir una nueva: ${resetUrl}`,
      '',
      'El enlace caduca en 1 hora y solo puede usarse una vez.',
      'Si no has sido tú, ignora este correo: tu contraseña no cambiará.',
      '',
      '— El equipo de Crecik',
    ].join('\n');
    await this.send(email, 'Restablece tu contraseña de Crecik', html, text);
  }
}
