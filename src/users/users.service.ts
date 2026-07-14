import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type {
  OnboardingState,
  UserProfileDto,
} from '../auth/dto/auth-response.dto';
import type { ChangePasswordDto, UpdateProfileDto } from './dto';

@Injectable()
export class UsersService {
  private static readonly DEFAULT_LANGUAGE = 'en';
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.language !== undefined)
      data.language = dto.language.trim().toLowerCase();

    const user = await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data,
    });

    return {
      id: Number(user.id),
      fullName: user.fullName ?? '',
      email: user.email ?? '',
      username: user.username,
      language: user.language ?? UsersService.DEFAULT_LANGUAGE,
      onboardingState: this.normalizeOnboarding(user.onboardingState),
    };
  }

  private normalizeOnboarding(raw: unknown): OnboardingState {
    const value = (raw ?? {}) as Partial<OnboardingState>;
    return {
      coachSeen: Array.isArray(value.coachSeen) ? value.coachSeen : [],
      checklistDismissed: value.checklistDismissed ?? false,
      celebrationShown: value.celebrationShown ?? false,
      reportsVisited: value.reportsVisited ?? false,
      tourVersion: value.tourVersion ?? 0,
    };
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      throw new NotFoundException('User was not found');
    }

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      UsersService.BCRYPT_ROUNDS,
    );
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { passwordHash, updatedAt: new Date() },
    });
  }
}
