import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ClientErrorsService } from './client-errors.service';

describe('ClientErrorsService', () => {
  let service: ClientErrorsService;

  const mockPrisma = { $queryRaw: jest.fn() };

  const dto = {
    context: 'transactions.loadAccounts',
    errorName: 'AxiosError',
    message: 'Network Error',
    stack:
      'AxiosError: Network Error\n    at xhr (https://crecik.com/assets/index-abc.js:1:2)',
    url: 'https://crecik.com/transactions',
    userAgent: 'Mozilla/5.0',
    appVersion: '0.11.0',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientErrorsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ClientErrorsService>(ClientErrorsService);
    jest.clearAllMocks();
  });

  it('reports isNew when the row was inserted', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ count: 1 }]);

    const result = await service.record(dto, null);

    expect(result.isNew).toBe(true);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports not new when the row already existed', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ count: 7 }]);

    const result = await service.record(dto, null);

    expect(result.isNew).toBe(false);
  });

  it('stores the authenticated user id when there is one', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ count: 1 }]);

    await service.record(dto, 4n);

    const params = mockPrisma.$queryRaw.mock.calls[0] as unknown[];
    expect(params).toContain(4n);
  });

  it('increments by the reported occurrence count', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ count: 5 }]);

    await service.record({ ...dto, occurrences: 4 }, null);

    const params = mockPrisma.$queryRaw.mock.calls[0] as unknown[];
    expect(params).toContain(4);
  });
});
