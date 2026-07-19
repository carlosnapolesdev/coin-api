import { buildPinoHttpOptions } from './logger';

type ResolvedOptions = {
  level: string;
  transport?: { target: string };
  redact: { paths: string[]; remove: boolean };
};

describe('buildPinoHttpOptions', () => {
  it('removes authorization and cookie request headers from logs', () => {
    const opts = buildPinoHttpOptions('production') as ResolvedOptions;
    expect(opts.redact.paths).toContain('req.headers.authorization');
    expect(opts.redact.paths).toContain('req.headers.cookie');
    expect(opts.redact.remove).toBe(true);
  });

  it('silences logging under test', () => {
    const opts = buildPinoHttpOptions('test') as ResolvedOptions;
    expect(opts.level).toBe('silent');
  });

  it('pretty-prints only in development', () => {
    const dev = buildPinoHttpOptions('development') as ResolvedOptions;
    const prod = buildPinoHttpOptions('production') as ResolvedOptions;
    expect(dev.transport?.target).toBe('pino-pretty');
    expect(prod.transport).toBeUndefined();
  });
});
