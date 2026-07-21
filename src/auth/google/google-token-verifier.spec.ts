import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

// Imported after the mock is registered.
import { GoogleTokenVerifierImpl } from './google-token-verifier';

describe('GoogleTokenVerifierImpl', () => {
  const config = {
    get: jest.fn().mockReturnValue('client-123'),
  } as unknown as ConfigService;
  let verifier: GoogleTokenVerifierImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    verifier = new GoogleTokenVerifierImpl(config);
  });

  it('normalizes a valid ticket payload', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'g-1',
        email: 'a@b.com',
        email_verified: true,
        name: 'Ada',
      }),
    });

    await expect(verifier.verify('tok')).resolves.toEqual({
      sub: 'g-1',
      email: 'a@b.com',
      emailVerified: true,
      name: 'Ada',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: 'client-123',
    });
  });

  it('throws GOOGLE_TOKEN_INVALID when the library rejects', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad signature'));
    await expect(verifier.verify('tok')).rejects.toMatchObject({
      response: { code: 'GOOGLE_TOKEN_INVALID' },
    });
    await expect(verifier.verify('tok')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws GOOGLE_TOKEN_INVALID when the payload has no sub or email', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'g-1' }) });
    await expect(verifier.verify('tok')).rejects.toMatchObject({
      response: { code: 'GOOGLE_TOKEN_INVALID' },
    });
  });
});
