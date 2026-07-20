import {
  Controller,
  Get,
  INestApplication,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

const JWT_SECRET = 's'.repeat(32);
const ISSUER = 'crecik';
const USER_ID = '1';

@Controller('probe')
class ProbeController {
  @UseGuards(AuthGuard('jwt'))
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('JwtStrategy token extraction', () => {
  let app: INestApplication;
  let server: Server;
  let token: string;

  beforeAll(async () => {
    const configMock = {
      get: (key: string, defaultValue?: string) =>
        ({ JWT_SECRET, JWT_ISSUER: ISSUER })[key] ?? defaultValue,
    };
    const prismaMock = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where?.id === 1n) {
            return Promise.resolve({
              id: BigInt(1),
              email: 'user@example.com',
              isActive: true,
              fullName: 'Test User',
              username: null,
              language: 'en',
              onboardingState: null,
            });
          }
          return Promise.resolve(null);
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ProbeController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;

    token = new JwtService({
      secret: JWT_SECRET,
      signOptions: { issuer: ISSUER },
    }).sign({}, { subject: USER_ID, expiresIn: 60 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid token in the Authorization header', async () => {
    await request(server)
      .get('/probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { ok: true });
  });

  it('rejects requests without a token', async () => {
    await request(server).get('/probe').expect(401);
  });

  it('rejects a valid token passed as ?token= query parameter', async () => {
    // Tokens in URLs leak into server/proxy logs, browser history and the
    // Referer header, so the query-parameter extractor must not exist.
    await request(server).get('/probe').query({ token }).expect(401);
  });
});

describe('JwtStrategy payload validation', () => {
  const configMock = {
    get: (key: string, defaultValue?: string) =>
      ({ JWT_SECRET, JWT_ISSUER: ISSUER })[key] ?? defaultValue,
  };
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
  };
  let strategy: JwtStrategy;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configMock },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    strategy = moduleRef.get(JwtStrategy);
  });

  beforeEach(() => {
    mockPrisma.user.findUnique.mockReset();
  });

  it('resolves the user by id from the subject', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 4n,
      email: 'user@test.com',
      fullName: 'User',
      username: null,
      language: 'es',
      onboardingState: null,
      isActive: true,
    });

    const result = await strategy.validate({
      sub: '4',
      iss: 'crecik',
      iat: 0,
      exp: 0,
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 4n },
    });
    expect(result.id).toBe(4);
  });

  it('rejects a subject that is not a valid id', async () => {
    // Tokens antiguos llevan el email en sub: deben caducar, no explotar.
    await expect(
      strategy.validate({
        sub: 'user@test.com',
        iss: 'crecik',
        iat: 0,
        exp: 0,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('JwtStrategy credential revocation', () => {
  let app: INestApplication;
  let server: Server;
  let credentialsChangedAt: Date | null;

  const signAt = (issuedAtSeconds: number) =>
    new JwtService({
      secret: JWT_SECRET,
      signOptions: { issuer: ISSUER },
    }).sign(
      { iat: issuedAtSeconds },
      {
        subject: USER_ID,
        expiresIn: issuedAtSeconds + 3600 - Math.floor(Date.now() / 1000),
      },
    );

  beforeAll(async () => {
    const configMock = {
      get: (key: string, defaultValue?: string) =>
        ({ JWT_SECRET, JWT_ISSUER: ISSUER })[key] ?? defaultValue,
    };
    const prismaMock = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) =>
          where?.id === 1n
            ? Promise.resolve({
                id: BigInt(1),
                email: 'user@example.com',
                isActive: true,
                fullName: 'Test User',
                username: null,
                language: 'en',
                onboardingState: null,
                credentialsChangedAt,
              })
            : Promise.resolve(null),
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ProbeController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a token when no revocation is recorded', async () => {
    credentialsChangedAt = null;
    const nowSeconds = Math.floor(Date.now() / 1000);
    await request(server)
      .get('/probe')
      .set('Authorization', `Bearer ${signAt(nowSeconds)}`)
      .expect(200);
  });

  it('rejects a token issued before the cutoff', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    credentialsChangedAt = new Date(nowSeconds * 1000);
    await request(server)
      .get('/probe')
      .set('Authorization', `Bearer ${signAt(nowSeconds - 1)}`)
      .expect(401);
  });

  // Protects the silent re-authentication: the token minted by the very request
  // that changed the password carries the same `iat` as the cutoff. If someone
  // "fixes" the truncation to a millisecond comparison, this test fails.
  it('accepts a token issued in the same second as the cutoff', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    credentialsChangedAt = new Date(nowSeconds * 1000);
    await request(server)
      .get('/probe')
      .set('Authorization', `Bearer ${signAt(nowSeconds)}`)
      .expect(200);
  });
});
