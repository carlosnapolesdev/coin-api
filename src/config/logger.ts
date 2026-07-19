import type { Params } from 'nestjs-pino';

export function buildPinoHttpOptions(
  nodeEnv: string | undefined,
): Params['pinoHttp'] {
  return {
    level: nodeEnv === 'test' ? 'silent' : 'info',
    transport:
      nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
    // Bearer tokens and cookies must never reach the logs.
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      remove: true,
    },
  };
}
