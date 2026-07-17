import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

const JWT_SECRET = 's'.repeat(32);
const ISSUER = 'coinflow';
const USER_EMAIL = 'user@example.com';

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
        findFirst: jest.fn().mockResolvedValue({
          id: BigInt(1),
          email: USER_EMAIL,
          isActive: true,
          fullName: 'Test User',
          username: null,
          language: 'en',
          onboardingState: null,
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
    }).sign({}, { subject: USER_EMAIL, expiresIn: 60 });
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
