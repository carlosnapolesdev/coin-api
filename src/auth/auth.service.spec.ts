import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'node:crypto';
import { CategoriesService } from '../categories/categories.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mockMail = { sendPasswordReset: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const mockJwt = { sign: jest.fn() };
  const mockCurrencies = { assignCurrenciesToUser: jest.fn() };
  const mockCategories = { assignDefaultCategoriesToUser: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailService, useValue: mockMail },
        { provide: CurrenciesService, useValue: mockCurrencies },
        { provide: CategoriesService, useValue: mockCategories },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns default onboarding state when none is stored', () => {
      expect(
        service.getProfile({
          id: 1,
          email: 'user@test.com',
          fullName: 'Test User',
          username: 'test-user',
          language: 'en',
          onboardingState: null,
        }),
      ).toEqual({
        id: 1,
        fullName: 'Test User',
        email: 'user@test.com',
        username: 'test-user',
        language: 'en',
        onboardingState: {
          coachSeen: [],
          checklistDismissed: false,
          celebrationShown: false,
          reportsVisited: false,
          tourVersion: 0,
        },
      });
    });

    it('returns the stored onboarding state', () => {
      const onboardingState = {
        coachSeen: ['dashboard'],
        checklistDismissed: true,
        celebrationShown: true,
        reportsVisited: true,
        tourVersion: 2,
      };

      expect(
        service.getProfile({
          id: 1,
          email: 'user@test.com',
          fullName: 'Test User',
          username: 'test-user',
          language: 'en',
          onboardingState,
        }),
      ).toEqual(
        expect.objectContaining({
          onboardingState,
        }),
      );
    });

    it('uses defaults for malformed onboarding field types', () => {
      const result = service.getProfile({
        id: 1,
        email: 'user@test.com',
        fullName: 'Test User',
        username: 'test-user',
        language: 'en',
        onboardingState: {
          coachSeen: ['dashboard', 1],
          checklistDismissed: 'true',
          celebrationShown: 1,
          reportsVisited: {},
          tourVersion: '2',
        },
      });

      expect(result.onboardingState).toEqual({
        coachSeen: [],
        checklistDismissed: false,
        celebrationShown: false,
        reportsVisited: false,
        tourVersion: 0,
      });
    });

    it.each([-1, 1.5])(
      'uses the default for invalid tourVersion %s',
      (tourVersion) => {
        const result = service.getProfile({
          id: 1,
          email: 'user@test.com',
          fullName: 'Test User',
          username: 'test-user',
          language: 'en',
          onboardingState: { tourVersion },
        });

        expect(result.onboardingState.tourVersion).toBe(0);
      },
    );
  });

  describe('forgotPassword', () => {
    it('does not throw and does not send an email when the email is unknown', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'ghost@test.com' }),
      ).resolves.toBeUndefined();
      expect(mockMail.sendPasswordReset).not.toHaveBeenCalled();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a hashed token and sends the reset email when the user exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 2n,
        email: 'user@test.com',
      });
      mockConfig.get.mockReturnValue('http://localhost:5173');

      await service.forgotPassword({ email: 'user@test.com' });

      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const data = mockPrisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe(2n);
      expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(mockMail.sendPasswordReset).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('/reset-password?token='),
      );
    });
  });

  describe('resetPassword', () => {
    it('throws BadRequestException for an unknown or expired token', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'invalid', newPassword: 'NewPass1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('resets the password and marks the token as used for a valid token', async () => {
      const rawToken = 'rawtoken';
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 1n,
        userId: 2n,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: null,
      });
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma),
      );

      await service.resetPassword({
        token: rawToken,
        newPassword: 'NewPass1',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 2n } }),
      );
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      });
    });
  });
});
