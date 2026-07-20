const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  const buildService = async (env: Record<string, string | undefined>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();
    return module.get<MailService>(MailService);
  };

  beforeEach(() => {
    mockSend.mockReset();
  });

  it('reports failure when Resend returns an error object', async () => {
    // Resend resuelve con { data, error }; no lanza. Un await que no lanza
    // no significa que el correo saliera.
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'domain not verified' },
    });
    service = await buildService({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Crecik <no-reply@crecik.com>',
    });

    const sent = await service.send('user@test.com', 'Subject', '<p>Body</p>');

    expect(sent).toBe(false);
  });

  it('reports success and passes the configured sender', async () => {
    mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null });
    service = await buildService({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Crecik <no-reply@crecik.com>',
    });

    const sent = await service.send('user@test.com', 'Subject', '<p>Body</p>');

    expect(sent).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Crecik <no-reply@crecik.com>',
      to: ['user@test.com'],
      subject: 'Subject',
      html: '<p>Body</p>',
      text: 'Body',
    });
  });

  it('always includes a plain-text alternative', async () => {
    // Un correo solo-HTML es señal clásica de spam. Sin parte de texto, un
    // dominio nuevo como crecik.com va derecho a la carpeta de correo no
    // deseado, que es lo que ocurrió en la primera prueba real.
    mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null });
    service = await buildService({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Crecik <no-reply@crecik.com>',
    });

    await service.send('user@test.com', 'Subject', '<p>Hola <b>mundo</b></p>');

    const call = mockSend.mock.calls[0][0] as { text?: string };
    expect(call.text).toBe('Hola mundo');
  });

  it('falls back to the default sender when MAIL_FROM is an empty string', async () => {
    // Joi define MAIL_FROM con default '' fuera de producción, así que el
    // valor llega vacío en vez de undefined y `??` no lo sustituye.
    mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null });
    service = await buildService({ RESEND_API_KEY: 'test-key', MAIL_FROM: '' });

    await service.send('user@test.com', 'Subject', '<p>Body</p>');

    const call = mockSend.mock.calls[0][0] as { from: string };
    expect(call.from).toBe('Crecik <no-reply@crecik.com>');
  });

  it('does not attempt to send when RESEND_API_KEY is missing', async () => {
    service = await buildService({ RESEND_API_KEY: undefined });

    const sent = await service.send('user@test.com', 'Subject', '<p>Body</p>');

    expect(sent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends the reset link through the transport', async () => {
    mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null });
    service = await buildService({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Crecik <no-reply@crecik.com>',
    });

    await service.sendPasswordReset(
      'user@test.com',
      'https://crecik.com/reset-password?token=x',
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0] as { to: string[]; html: string };
    expect(call.to).toEqual(['user@test.com']);
    expect(call.html).toContain('https://crecik.com/reset-password?token=x');
  });
});
