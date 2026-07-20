import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ClientErrorsScheduler } from './client-errors.scheduler';

describe('ClientErrorsScheduler', () => {
  let scheduler: ClientErrorsScheduler;

  const mockPrisma = {
    clientError: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const mockMail = { send: jest.fn() };

  const build = async (digestTo: string | undefined) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientErrorsScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        {
          provide: ConfigService,
          useValue: { get: () => digestTo },
        },
      ],
    }).compile();
    return module.get<ClientErrorsScheduler>(ClientErrorsScheduler);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMail.send.mockResolvedValue(true);
  });

  it('sends nothing when there is no activity', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.findMany.mockResolvedValue([]);

    await scheduler.sendDigest();

    expect(mockMail.send).not.toHaveBeenCalled();
  });

  it('formats dates for a human and pluralizes the count', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.findMany.mockResolvedValue([
      {
        context: 'una.vez',
        errorName: 'TypeError',
        count: 1,
        firstSeenAt: new Date('2026-07-19T17:48:33.051Z'),
        lastSeenAt: new Date('2026-07-19T17:48:33.051Z'),
      },
      {
        context: 'varias.veces',
        errorName: 'RangeError',
        count: 12,
        firstSeenAt: new Date('2026-07-19T17:48:33.051Z'),
        lastSeenAt: new Date('2026-07-20T01:48:33.051Z'),
      },
    ]);

    await scheduler.sendDigest();

    const html = (mockMail.send.mock.calls[0] as string[])[2];
    // Nada de ISO crudo: 2026-07-19T17:48:33.051Z no se lee en un correo.
    expect(html).not.toContain('2026-07-19T17:48:33.051Z');
    expect(html).toContain('1 vez');
    expect(html).not.toContain('1 vez/veces');
    expect(html).toContain('12 veces');
  });

  it('escapes attacker-controlled fields in the digest', async () => {
    // context y errorName llegan por un endpoint público sin autenticar:
    // cualquiera puede inyectar HTML en el correo que recibe el administrador.
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.findMany.mockResolvedValue([
      {
        context: '<img src=x onerror=alert(1)>',
        errorName: '<a href="https://evil.test">Verifica tu cuenta</a>',
        count: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ]);

    await scheduler.sendDigest();

    const html = (mockMail.send.mock.calls[0] as string[])[2];
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a href');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes attacker-controlled fields in the immediate alert', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.count.mockResolvedValue(0);
    mockPrisma.clientError.findUnique.mockResolvedValue({
      context: '<script>x</script>',
      errorName: '<a href="https://evil.test">click</a>',
    });

    await scheduler.notifyNew('abc');

    const [, subject, html] = mockMail.send.mock.calls[0] as string[];
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href');
    // El asunto es texto plano: no debe arrastrar marcado tampoco.
    expect(subject).not.toContain('<script>');
  });

  it('keeps newlines out of the subject to prevent header injection', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.count.mockResolvedValue(0);
    mockPrisma.clientError.findUnique.mockResolvedValue({
      context: 'a\r\nBcc: victima@ejemplo.com',
      errorName: 'TypeError',
    });

    await scheduler.notifyNew('abc');

    const subject = (mockMail.send.mock.calls[0] as string[])[1];
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('sends a digest listing the errors seen in the window', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.findMany.mockResolvedValue([
      {
        context: 'onboarding.sync',
        errorName: 'AxiosError',
        count: 12,
        firstSeenAt: new Date('2026-07-18T10:00:00Z'),
        lastSeenAt: new Date('2026-07-19T06:00:00Z'),
      },
    ]);

    await scheduler.sendDigest();

    expect(mockMail.send).toHaveBeenCalledTimes(1);
    const [to, subject, html] = mockMail.send.mock.calls[0] as string[];
    expect(to).toBe('dev@crecik.com');
    expect(subject).toContain('1');
    expect(html).toContain('onboarding.sync');
    expect(html).toContain('12');
  });

  it('never puts message, stack or url in the digest', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.findMany.mockResolvedValue([
      {
        context: 'transactions.save',
        errorName: 'AxiosError',
        count: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        message: 'No se pudo guardar el movimiento de 1250 EUR de ana@test.com',
        stack: 'at secretFrame',
        url: 'https://crecik.com/transactions?account=7',
      },
    ]);

    await scheduler.sendDigest();

    const html = (mockMail.send.mock.calls[0] as string[])[2];
    expect(html).not.toContain('1250');
    expect(html).not.toContain('ana@test.com');
    expect(html).not.toContain('secretFrame');
    expect(html).not.toContain('account=7');
  });

  it('does not send when the digest recipient is not configured', async () => {
    scheduler = await build(undefined);
    mockPrisma.clientError.findMany.mockResolvedValue([
      {
        context: 'a',
        errorName: 'E',
        count: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ]);

    await scheduler.sendDigest();

    expect(mockMail.send).not.toHaveBeenCalled();
  });

  it('skips the immediate alert when another one went out within the hour', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.count.mockResolvedValue(1); // ya hubo aviso reciente

    await scheduler.notifyNew('abc');

    expect(mockMail.send).not.toHaveBeenCalled();
  });

  it('sends the immediate alert and stamps notifiedAt when the hour is clear', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.count.mockResolvedValue(0);
    mockPrisma.clientError.findUnique.mockResolvedValue({
      context: 'onboarding.sync',
      errorName: 'AxiosError',
    });

    await scheduler.notifyNew('abc');

    expect(mockMail.send).toHaveBeenCalledTimes(1);
    expect(mockPrisma.clientError.update).toHaveBeenCalledWith({
      where: { fingerprint: 'abc' },
      data: { notifiedAt: expect.any(Date) },
    });
  });

  it('prunes rows older than the retention window', async () => {
    scheduler = await build('dev@crecik.com');
    mockPrisma.clientError.deleteMany.mockResolvedValue({ count: 3 });

    const removed = await scheduler.prune();

    expect(removed).toBe(3);
    const arg = mockPrisma.clientError.deleteMany.mock.calls[0][0] as {
      where: { lastSeenAt: { lt: Date } };
    };
    const cutoff = arg.where.lastSeenAt.lt;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });
});
