import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type {
  OnboardingState,
  UserProfileDto,
} from '../auth/dto/auth-response.dto';
import type {
  ChangePasswordDto,
  UpdateOnboardingDto,
  UpdateProfileDto,
} from './dto';
import { normalizeOnboardingState } from '../common/onboarding-state';
import { MailService } from '../mail/mail.service';

@Injectable()
export class UsersService {
  private static readonly DEFAULT_LANGUAGE = 'en';
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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
      onboardingState: normalizeOnboardingState(user.onboardingState),
    };
  }

  async updateOnboarding(
    userId: number,
    dto: UpdateOnboardingDto,
  ): Promise<OnboardingState> {
    // El merge ocurre dentro del UPDATE (operador `||` de jsonb) en vez de
    // leer-mezclar-escribir desde Node. El cliente dispara estos PATCH en
    // fire-and-forget al navegar, así que dos parciales pueden solaparse; con
    // read-modify-write el segundo escribía el objeto entero a partir de una
    // lectura obsoleta y revertía el campo del primero (lost update).
    // Precedencia: defaults < estado persistido < parcial entrante.
    const defaults = JSON.stringify(normalizeOnboardingState({}));
    const patch = JSON.stringify(dto);

    const rows = await this.prisma.$queryRaw<
      { onboarding_state: unknown }[]
    >`UPDATE users
         SET onboarding_state = ${defaults}::jsonb
                                || COALESCE(onboarding_state, '{}'::jsonb)
                                || ${patch}::jsonb,
             updated_at = NOW()
       WHERE id = ${BigInt(userId)}
       RETURNING onboarding_state`;

    if (rows.length === 0) {
      throw new NotFoundException('User was not found');
    }

    return normalizeOnboardingState(rows[0].onboarding_state);
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { passwordHash: true, email: true },
    });
    if (!user?.passwordHash) {
      throw new NotFoundException('User was not found');
    }

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      UsersService.BCRYPT_ROUNDS,
    );
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { passwordHash, updatedAt: new Date() },
    });

    if (user.email) {
      await this.sendPasswordChangedNotice(user.email);
    }
  }

  /**
   * Aviso best-effort: `send` devuelve false en vez de lanzar, así que un fallo
   * de correo no revierte un cambio de contraseña que ya se guardó.
   *
   * Sin enlaces a propósito. Un correo de seguridad que pide pulsar algo educa
   * al usuario a pulsar enlaces en correos de seguridad, que es justo lo que
   * explota el phishing. Si no reconoce el cambio, que entre por su cuenta.
   */
  private async sendPasswordChangedNotice(email: string): Promise<void> {
    const html = [
      '<p>Hola,</p>',
      '<p>La contraseña de tu cuenta de Crecik acaba de cambiarse.</p>',
      '<p>Si has sido tú, no tienes que hacer nada.</p>',
      '<p>Si no reconoces este cambio, alguien puede tener acceso a tu cuenta: entra en Crecik y restablece tu contraseña cuanto antes.</p>',
      '<p>— El equipo de Crecik</p>',
    ].join('');
    const text = [
      'Hola,',
      '',
      'La contraseña de tu cuenta de Crecik acaba de cambiarse.',
      '',
      'Si has sido tú, no tienes que hacer nada.',
      '',
      'Si no reconoces este cambio, alguien puede tener acceso a tu cuenta:',
      'entra en Crecik y restablece tu contraseña cuanto antes.',
      '',
      '— El equipo de Crecik',
    ].join('\n');
    await this.mail.send(
      email,
      'Tu contraseña de Crecik ha cambiado',
      html,
      text,
    );
  }
}
