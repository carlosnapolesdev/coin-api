import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginTicket, OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** Injectable seam so consumers can be tested without hitting Google. */
export abstract class GoogleTokenVerifier {
  abstract verify(idToken: string): Promise<GoogleIdentity>;
}

@Injectable()
export class GoogleTokenVerifierImpl extends GoogleTokenVerifier {
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(config: ConfigService) {
    super();
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.client = new OAuth2Client(this.clientId);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload: ReturnType<LoginTicket['getPayload']>;
    try {
      // verifyIdToken checks signature, issuer, audience and expiry.
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      // The raw reason (bad signature, expired, wrong audience) is not useful
      // to the client and must not leak; collapse to one stable code.
      throw new BadRequestException({
        code: 'GOOGLE_TOKEN_INVALID',
        message: 'Google token could not be verified',
      });
    }

    if (!payload?.sub || !payload.email) {
      throw new BadRequestException({
        code: 'GOOGLE_TOKEN_INVALID',
        message: 'Google token is missing required claims',
      });
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name?.trim() || null,
    };
  }
}
