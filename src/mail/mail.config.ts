import type { ConfigService } from '@nestjs/config';

export interface MailConfig {
  apiKey: string | undefined;
  from: string;
  digestTo: string | undefined;
}

const DEFAULT_FROM = 'Crecik <no-reply@crecik.com>';

/**
 * Se normaliza a undefined lo que venga vacío: el esquema de Joi define estas
 * variables con `.default('')` fuera de producción, así que llegan como cadena
 * vacía y no como undefined. Con `??` la cadena vacía pasaba tal cual y el
 * remitente acababa siendo "".
 */
function readOptional(config: ConfigService, key: string): string | undefined {
  const value = config.get<string>(key)?.trim();
  return value ? value : undefined;
}

export function buildMailConfig(config: ConfigService): MailConfig {
  return {
    apiKey: readOptional(config, 'RESEND_API_KEY'),
    from: readOptional(config, 'MAIL_FROM') ?? DEFAULT_FROM,
    digestTo: readOptional(config, 'CLIENT_ERRORS_DIGEST_TO'),
  };
}
