import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthResponseDto,
  RegisterResponseDto,
  UserProfileDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private static readonly DEFAULT_LANGUAGE = 'en';
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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

    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash: await bcrypt.hash(
          dto.password,
          AuthService.BCRYPT_ROUNDS,
        ),
        language: this.resolveLanguage(dto.language),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
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
