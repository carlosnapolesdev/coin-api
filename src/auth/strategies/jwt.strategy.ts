import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string | null;
  username: string | null;
  language: string | null;
  onboardingState: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
      issuer: config.get<string>('JWT_ISSUER', 'crecik'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    let userId: bigint;
    try {
      userId = BigInt(payload.sub);
    } catch {
      // Token emitido antes de la migración de sub (llevaba el email).
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Authentication required');
    }

    // Changing a password revokes every token issued before that moment. Both
    // sides are compared in whole seconds — see credentialsCutoff for why.
    if (
      user.credentialsChangedAt &&
      payload.iat < Math.floor(user.credentialsChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      id: Number(user.id),
      email: user.email ?? '',
      fullName: user.fullName,
      username: user.username,
      language: user.language,
      onboardingState: user.onboardingState ?? null,
    };
  }
}
