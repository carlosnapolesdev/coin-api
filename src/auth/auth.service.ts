import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { CategoriesService } from '../categories/categories.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { credentialsCutoff } from '../common/credentials-cutoff';
import {
  AuthResponseDto,
  AuthTokenDto,
  RegisterResponseDto,
  UserProfileDto,
} from './dto/auth-response.dto';
import { normalizeOnboardingState } from '../common/onboarding-state';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto, VerifyEmailDto } from './dto';
import type { ForgotPasswordDto, ResetPasswordDto } from '../users/dto';
import { AuthenticatedUser } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private static readonly DEFAULT_LANGUAGE = 'en';
  private static readonly BCRYPT_ROUNDS = 10;
  private static readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
  private static readonly VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly RESEND_MAX_PER_HOUR = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly currenciesService: CurrenciesService,
    private readonly categoriesService: CategoriesService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const emailExists = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (emailExists) {
      throw new ConflictException(
        'There is already an account registered with that email address',
      );
    }

    const normalizedUsername = dto.username?.trim() || null;
    if (normalizedUsername) {
      const usernameExists = await this.prisma.user.findFirst({
        where: {
          username: { equals: normalizedUsername, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (usernameExists) {
        throw new ConflictException('That username is already in use');
      }
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      AuthService.BCRYPT_ROUNDS,
    );
    const language = this.resolveLanguage(dto.language);
    const now = new Date();

    const { created, rawToken } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: normalizedEmail,
          username: normalizedUsername,
          passwordHash,
          language,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.currenciesService.assignCurrenciesToUser(
        created.id,
        dto.currencies,
        tx,
      );

      const activeCategoryIds = dto.categoryIds
        ? new Set(dto.categoryIds.map(BigInt))
        : undefined;
      await this.categoriesService.assignDefaultCategoriesToUser(
        created.id,
        language,
        activeCategoryIds,
        tx,
      );

      const verificationToken = await this.createVerificationToken(
        created.id,
        tx,
      );
      return { created, rawToken: verificationToken };
    });

    // Outside the transaction on purpose: a transport hiccup must not roll back
    // a created account. The user can always ask for a new link.
    await this.mail.sendEmailVerification(
      created.email!,
      this.verificationUrl(rawToken),
    );

    return this.toRegisterResponse(created);
  }

  private async createVerificationToken(
    userId: bigint,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    await tx.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + AuthService.VERIFICATION_TOKEN_TTL_MS),
      },
    });
    return rawToken;
  }

  private verificationUrl(rawToken: string): string {
    const appUrl =
      this.config.get<string>('APP_URL') || 'http://localhost:5173';
    return `${appUrl}/verify-email?token=${rawToken}`;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const identifier = dto.identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 403 with a code, not 401: the client has to tell this apart from bad
    // credentials to offer the resend. This is not an enumeration vector —
    // reaching it requires already knowing the password.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email address has not been verified',
      });
    }

    const issued = this.issueToken(user, dto.rememberMe ?? false);
    return { ...issued, user: this.toUserProfile(user) };
  }

  /** Mints a token for an already-authenticated user. */
  issueToken(user: User, rememberMe = false): AuthTokenDto {
    const expirationMs = rememberMe
      ? (this.config.get<number>('JWT_REMEMBER_ME_EXPIRATION_MS') ?? 604800000)
      : (this.config.get<number>('JWT_EXPIRATION_MS') ?? 3600000);

    const token = this.jwtService.sign(
      {},
      {
        // El id es la clave estable del usuario. El email puede cambiar y
        // obligaba a resolver por email en cada petición autenticada.
        subject: String(user.id),
        expiresIn: Math.floor(expirationMs / 1000),
      },
    );

    return {
      token,
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + expirationMs),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    if (!user) {
      return; // no user enumeration
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + AuthService.RESET_TOKEN_TTL_MS),
      },
    });

    const appUrl =
      this.config.get<string>('APP_URL') || 'http://localhost:5173';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await this.mail.sendPasswordReset(user.email!, resetUrl);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!record) {
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      AuthService.BCRYPT_ROUNDS,
    );
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          credentialsChangedAt: credentialsCutoff(now),
          updatedAt: now,
        },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });
      // Asking for three resets used to leave the other two usable for an hour
      // after the first one landed. A completed reset burns all of them.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
    });
  }

  async resendVerification(dto: ResendVerificationDto): Promise<void> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    // Every early return below resolves silently: an observable difference
    // between "unknown", "already verified" and "rate limited" would turn this
    // endpoint into an oracle for which addresses are registered.
    if (!user || user.emailVerifiedAt) {
      return;
    }

    // Counting rows beats a rate-limiter store: the tokens are already
    // persisted with createdAt, and NestJS's throttler keys on IP, which is
    // useless for protecting a third party's inbox from a rotating attacker.
    const recent = await this.prisma.emailVerificationToken.count({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent >= AuthService.RESEND_MAX_PER_HOUR) {
      return;
    }

    const rawToken = await this.prisma.$transaction((tx) =>
      this.createVerificationToken(user.id, tx),
    );
    await this.mail.sendEmailVerification(
      user.email!,
      this.verificationUrl(rawToken),
    );
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash: this.hashToken(dto.token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { emailVerifiedAt: true } } },
    });
    // Invalid, expired and already-used collapse into one message on purpose:
    // telling them apart confirms to an attacker that a token once existed.
    if (!record) {
      throw new BadRequestException('Invalid or expired token');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Clicking the link twice must not look like a failure, so an already
      // verified account keeps its original date and still burns the token.
      if (!record.user.emailVerifiedAt) {
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: now },
        });
      }
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });
    });
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  getProfile(authenticatedUser: AuthenticatedUser): UserProfileDto {
    return {
      id: authenticatedUser.id,
      fullName: authenticatedUser.fullName ?? '',
      email: authenticatedUser.email,
      username: authenticatedUser.username,
      language: authenticatedUser.language ?? AuthService.DEFAULT_LANGUAGE,
      onboardingState: normalizeOnboardingState(
        authenticatedUser.onboardingState,
      ),
    };
  }

  private resolveLanguage(language?: string): string {
    const trimmed = language?.trim().toLowerCase();
    return trimmed || AuthService.DEFAULT_LANGUAGE;
  }

  private toRegisterResponse(user: User): RegisterResponseDto {
    return {
      id: Number(user.id),
      fullName: user.fullName ?? '',
      email: user.email ?? '',
      username: user.username,
      language: user.language ?? AuthService.DEFAULT_LANGUAGE,
      createdAt: user.createdAt,
    };
  }

  private toUserProfile(user: User): UserProfileDto {
    return {
      id: Number(user.id),
      fullName: user.fullName ?? '',
      email: user.email ?? '',
      username: user.username,
      language: user.language ?? AuthService.DEFAULT_LANGUAGE,
      onboardingState: normalizeOnboardingState(user.onboardingState),
    };
  }
}
