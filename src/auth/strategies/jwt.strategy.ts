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
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
      issuer: config.get<string>('JWT_ISSUER', 'coinflow'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: payload.sub, mode: 'insensitive' } },
    });
    if (!user || !user.isActive) {
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
