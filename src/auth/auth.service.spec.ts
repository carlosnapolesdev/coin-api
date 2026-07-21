import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { CategoriesService } from '../categories/categories.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleTokenVerifier } from './google/google-token-verifier';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    userCurrency: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mockMail = {
    sendPasswordReset: jest.fn(),
    sendEmailVerification: jest.fn(),
  };
  const mockConfig = { get: jest.fn() };
  const mockJwt = { sign: jest.fn() };
  const mockCurrencies = { assignCurrenciesToUser: jest.fn() };
  const mockCategories = { assignDefaultCategoriesToUser: jest.fn() };
  const mockVerifier = { verify: jest.fn() };

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
        { provide: GoogleTokenVerifier, useValue: mockVerifier },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns default onboarding state when none is stored', async () => {
      mockPrisma.userCurrency.count.mockResolvedValue(1);
      const profile = await service.getProfile({
        id: 1,
        email: 'user@test.com',
        fullName: 'Test User',
        username: 'test-user',
        language: 'en',
        onboardingState: null,
      });

      expect(profile).toEqual({
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
        requiresCurrencySetup: false,
      });
    });

    it('returns the stored onboarding state', async () => {
      mockPrisma.userCurrency.count.mockResolvedValue(1);
      const onboardingState = {
        coachSeen: ['dashboard'],
        checklistDismissed: true,
        celebrationShown: true,
        reportsVisited: true,
        tourVersion: 2,
      };

      const profile = await service.getProfile({
        id: 1,
        email: 'user@test.com',
        fullName: 'Test User',
        username: 'test-user',
        language: 'en',
        onboardingState,
      });

      expect(profile).toEqual(
        expect.objectContaining({
          onboardingState,
        }),
      );
    });

    it('uses defaults for malformed onboarding field types', async () => {
      mockPrisma.userCurrency.count.mockResolvedValue(1);
      const result = await service.getProfile({
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
      async (tourVersion) => {
        mockPrisma.userCurrency.count.mockResolvedValue(1);
        const result = await service.getProfile({
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

  describe('computeRequiresCurrencySetup', () => {
    it('is true when there is no active base currency', async () => {
      mockPrisma.userCurrency.count.mockResolvedValue(0);
      await expect(service.computeRequiresCurrencySetup(1n)).resolves.toBe(
        true,
      );
      expect(mockPrisma.userCurrency.count).toHaveBeenCalledWith({
        where: { userId: 1n, isActive: true, isBase: true },
      });
    });

    it('is false when an active base currency exists', async () => {
      mockPrisma.userCurrency.count.mockResolvedValue(1);
      await expect(service.computeRequiresCurrencySetup(1n)).resolves.toBe(
        false,
      );
    });
  });

  describe('login', () => {
    it('signs the token with the user id as subject, not the email', async () => {
      // El email cambia y no es una clave estable; además obligaba a resolver
      // el usuario por email en cada petición autenticada.
      const passwordHash = await bcrypt.hash('Right1', 4);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1n,
        email: 'user@test.com',
        fullName: 'User',
        username: null,
        language: 'en',
        onboardingState: null,
        isActive: true,
        emailVerifiedAt: new Date(),
        passwordHash,
      });
      mockConfig.get.mockReturnValue(3600000);

      const signSpy = jest.spyOn(mockJwt, 'sign');
      await service.login({ identifier: 'user@test.com', password: 'Right1' });

      const options = signSpy.mock.calls[0][1] as { subject: string };
      expect(options.subject).toBe('1');
    });
  });

  describe('login email verification gate', () => {
    const arrangeUser = async (emailVerifiedAt: Date | null) => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: BigInt(1),
        email: 'user@test.com',
        username: null,
        fullName: 'User',
        language: 'en',
        isActive: true,
        onboardingState: null,
        emailVerifiedAt,
        passwordHash: await bcrypt.hash('secret123', 10),
      });
    };

    it('refuses an unverified account even with the right password', async () => {
      await arrangeUser(null);
      await expect(
        service.login({ identifier: 'user@test.com', password: 'secret123' }),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: 'EMAIL_NOT_VERIFIED' },
      });
    });

    it('lets a verified account through', async () => {
      await arrangeUser(new Date());
      mockConfig.get.mockReturnValue(3600000);
      mockJwt.sign.mockReturnValue('signed');

      const result = await service.login({
        identifier: 'user@test.com',
        password: 'secret123',
      });

      expect(result.token).toBe('signed');
    });
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

  describe('resetPassword records the credential cutoff and burns every live sibling token', () => {
    it('marks the cutoff, uses the presented token, and burns any sibling reset tokens', async () => {
      const record = { id: BigInt(7), userId: BigInt(3) };
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(record);

      const tx = {
        user: { update: jest.fn() },
        passwordResetToken: { update: jest.fn(), updateMany: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      await service.resetPassword({ token: 'raw', newPassword: 'secret123' });

      const userUpdate = tx.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: BigInt(3) });
      expect(userUpdate.data.credentialsChangedAt).toBeInstanceOf(Date);
      expect(userUpdate.data.credentialsChangedAt.getMilliseconds()).toBe(0);

      expect(tx.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: BigInt(7) },
        data: { usedAt: expect.any(Date) },
      });
      expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: BigInt(3), usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  describe('register', () => {
    it('creates a verification token and emails the link', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockConfig.get.mockImplementation((key: string) =>
        key === 'APP_URL' ? 'https://crecik.com' : undefined,
      );
      const created = { id: BigInt(9), email: 'new@test.com', fullName: 'New' };
      const tx = {
        user: { create: jest.fn().mockResolvedValue(created) },
        emailVerificationToken: { create: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );
      mockCurrencies.assignCurrenciesToUser.mockResolvedValue(undefined);
      mockCategories.assignDefaultCategoriesToUser.mockResolvedValue(undefined);

      await service.register({
        fullName: 'New',
        email: 'new@test.com',
        password: 'secret123',
        currencies: [],
      });

      expect(tx.emailVerificationToken.create).toHaveBeenCalled();
      expect(mockMail.sendEmailVerification).toHaveBeenCalledWith(
        'new@test.com',
        expect.stringContaining('https://crecik.com/verify-email?token='),
      );
    });
  });

  describe('verifyEmail', () => {
    it('marks the account verified and burns the token', async () => {
      mockPrisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: BigInt(2),
        userId: BigInt(5),
        user: { emailVerifiedAt: null },
      });
      const tx = {
        user: { update: jest.fn() },
        emailVerificationToken: { update: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      await service.verifyEmail({ token: 'raw' });

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: BigInt(5) },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(tx.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: BigInt(2) },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('is idempotent on an already verified account', async () => {
      const verifiedAt = new Date('2026-07-01T00:00:00Z');
      mockPrisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: BigInt(2),
        userId: BigInt(5),
        user: { emailVerifiedAt: verifiedAt },
      });
      const tx = {
        user: { update: jest.fn() },
        emailVerificationToken: { update: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(
        (cb: (t: typeof tx) => unknown) => cb(tx),
      );

      await service.verifyEmail({ token: 'raw' });

      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.emailVerificationToken.update).toHaveBeenCalled();
    });

    it('rejects an invalid, expired or already used token', async () => {
      mockPrisma.emailVerificationToken.findFirst.mockResolvedValue(null);
      await expect(service.verifyEmail({ token: 'nope' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resendVerification', () => {
    const setUser = (user: unknown): void => {
      mockPrisma.user.findFirst.mockResolvedValue(user);
    };

    beforeEach(() => {
      mockConfig.get.mockImplementation((key: string) =>
        key === 'APP_URL' ? 'https://crecik.com' : undefined,
      );
      mockPrisma.$transaction.mockImplementation(
        (cb: (t: unknown) => unknown) =>
          cb({ emailVerificationToken: { create: jest.fn() } }),
      );
    });

    it('sends a fresh link to an unverified account', async () => {
      setUser({ id: BigInt(5), email: 'user@test.com', emailVerifiedAt: null });
      mockPrisma.emailVerificationToken.count.mockResolvedValue(0);

      await service.resendVerification({ email: 'user@test.com' });

      expect(mockMail.sendEmailVerification).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('https://crecik.com/verify-email?token='),
      );
    });

    it('stays silent for an unknown address', async () => {
      setUser(null);
      await expect(
        service.resendVerification({ email: 'ghost@test.com' }),
      ).resolves.toBeUndefined();
      expect(mockMail.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('stays silent for an already verified account', async () => {
      setUser({
        id: BigInt(5),
        email: 'user@test.com',
        emailVerifiedAt: new Date(),
      });
      await expect(
        service.resendVerification({ email: 'user@test.com' }),
      ).resolves.toBeUndefined();
      expect(mockMail.sendEmailVerification).not.toHaveBeenCalled();
    });

    // Without a per-address cap this endpoint is a way to flood someone else's
    // inbox at our expense. Throttling must not be observable, so it still
    // resolves — a 429 would turn it into an existence oracle.
    it('stops sending past the hourly cap without signalling it', async () => {
      setUser({ id: BigInt(5), email: 'user@test.com', emailVerifiedAt: null });
      mockPrisma.emailVerificationToken.count.mockResolvedValue(3);

      await expect(
        service.resendVerification({ email: 'user@test.com' }),
      ).resolves.toBeUndefined();
      expect(mockMail.sendEmailVerification).not.toHaveBeenCalled();
    });
  });

  describe('getGoogleConfig', () => {
    it('returns the configured Google client id', () => {
      mockConfig.get.mockReturnValue('client-123.apps.googleusercontent.com');
      expect(service.getGoogleConfig()).toEqual({
        clientId: 'client-123.apps.googleusercontent.com',
      });
      expect(mockConfig.get).toHaveBeenCalledWith('GOOGLE_CLIENT_ID');
    });

    it('returns an empty string when unset', () => {
      mockConfig.get.mockReturnValue(undefined);
      expect(service.getGoogleConfig()).toEqual({ clientId: '' });
    });
  });

  describe('loginWithGoogle', () => {
    const identity = {
      sub: 'g-1',
      email: 'ada@b.com',
      emailVerified: true,
      name: 'Ada',
    };

    beforeEach(() => {
      mockVerifier.verify.mockResolvedValue(identity);
      mockJwt.sign.mockReturnValue('signed');
      mockConfig.get.mockReturnValue(3600000);
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
      );
    });

    it('logs in an existing googleId user', async () => {
      const user = {
        id: 1n,
        email: 'ada@b.com',
        fullName: 'Ada',
        username: null,
        language: 'en',
        googleId: 'g-1',
        isActive: true,
      };
      mockPrisma.user.findFirst.mockResolvedValueOnce(user);
      mockPrisma.userCurrency.count.mockResolvedValue(1);

      const res = await service.loginWithGoogle({ idToken: 'tok' });

      expect(res.user.requiresCurrencySetup).toBe(false);
      expect(res.token).toBe('signed');
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('links googleId to an existing verified-email account', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 2n,
          email: 'ada@b.com',
          googleId: null,
          fullName: 'Ada',
          username: null,
          language: 'en',
          isActive: true,
        });
      mockPrisma.user.update.mockResolvedValue({
        id: 2n,
        email: 'ada@b.com',
        googleId: 'g-1',
        fullName: 'Ada',
        username: null,
        language: 'en',
        isActive: true,
      });
      mockPrisma.userCurrency.count.mockResolvedValue(1);

      await service.loginWithGoogle({ idToken: 'tok' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2n },
          data: expect.objectContaining({ googleId: 'g-1' }),
        }),
      );
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses to link when Google email is unverified', async () => {
      mockVerifier.verify.mockResolvedValue({
        ...identity,
        emailVerified: false,
      });
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 2n, email: 'ada@b.com', googleId: null });

      await expect(
        service.loginWithGoogle({ idToken: 'tok' }),
      ).rejects.toMatchObject({
        response: { code: 'GOOGLE_EMAIL_UNVERIFIED' },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('registers a new account with all categories and no currency', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 3n,
        email: 'ada@b.com',
        googleId: 'g-1',
        fullName: 'Ada',
        username: null,
        language: 'en',
        isActive: true,
      });
      mockPrisma.userCurrency.count.mockResolvedValue(0);

      const res = await service.loginWithGoogle({ idToken: 'tok' });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleId: 'g-1',
            email: 'ada@b.com',
            passwordHash: null,
          }),
        }),
      );
      expect(mockCategories.assignDefaultCategoriesToUser).toHaveBeenCalledWith(
        3n,
        'en',
        undefined,
        mockPrisma,
      );
      expect(mockCurrencies.assignCurrenciesToUser).not.toHaveBeenCalled();
      expect(mockMail.sendEmailVerification).not.toHaveBeenCalled();
      expect(res.user.requiresCurrencySetup).toBe(true);
    });
  });
});
