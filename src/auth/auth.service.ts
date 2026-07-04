import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { CategoriesService } from '../categories/categories.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthResponseDto,
  RegisterResponseDto,
  UserProfileDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { ForgotPasswordDto, ResetPasswordDto } from '../users/dto';
import { AuthenticatedUser } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private static readonly DEFAULT_LANGUAGE = 'en';
  private static readonly BCRYPT_ROUNDS = 10;
  private static readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

    const user = await this.prisma.$transaction(async (tx) => {
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

      return created;
    });

    return this.toRegisterResponse(user);
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

    const rememberMe = dto.rememberMe ?? false;
    const expirationMs = rememberMe
      ? (this.config.get<number>('JWT_REMEMBER_ME_EXPIRATION_MS') ?? 604800000)
      : (this.config.get<number>('JWT_EXPIRATION_MS') ?? 3600000);

    const expiresAt = new Date(Date.now() + expirationMs);
    const token = this.jwtService.sign(
      {},
      {
        subject: user.email ?? undefined,
        expiresIn: Math.floor(expirationMs / 1000),
      },
    );

    return {
      token,
      tokenType: 'Bearer',
      expiresAt,
      user: this.toUserProfile(user),
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
    const tokenHash = this.hashResetToken(rawToken);
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
    const tokenHash = this.hashResetToken(dto.token);
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
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, updatedAt: new Date() },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });
  }

  private hashResetToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  getProfile(authenticatedUser: AuthenticatedUser): UserProfileDto {
    return {
      id: authenticatedUser.id,
      fullName: authenticatedUser.fullName ?? '',
      email: authenticatedUser.email,
      username: authenticatedUser.username,
      language: authenticatedUser.language ?? AuthService.DEFAULT_LANGUAGE,
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
    };
  }
}
