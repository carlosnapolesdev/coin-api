import { envValidationSchema } from './env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/crecik',
  JWT_SECRET: 'a'.repeat(32),
};

describe('envValidationSchema — CORS_ORIGIN', () => {
  it('fails in production when CORS_ORIGIN is missing', () => {
    const { error } = envValidationSchema.validate(
      { ...baseEnv, NODE_ENV: 'production' },
      { abortEarly: false },
    );
    expect(error?.message).toContain('CORS_ORIGIN');
  });

  it('fails in production when CORS_ORIGIN is empty', () => {
    const { error } = envValidationSchema.validate(
      { ...baseEnv, NODE_ENV: 'production', CORS_ORIGIN: '' },
      { abortEarly: false },
    );
    expect(error?.message).toContain('CORS_ORIGIN');
  });

  it('passes in production when CORS_ORIGIN lists origins', () => {
    const { error } = envValidationSchema.validate(
      {
        ...baseEnv,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.example.com,https://other.example.com',
        APP_URL: 'https://app.example.com',
        MAIL_FROM: 'Crecik <no-reply@crecik.com>',
      },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });

  it('allows empty CORS_ORIGIN outside production', () => {
    const { error } = envValidationSchema.validate(
      { ...baseEnv, NODE_ENV: 'development' },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });
});

describe('envValidationSchema — APP_URL', () => {
  const prodEnv = {
    ...baseEnv,
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://app.example.com',
    MAIL_FROM: 'Crecik <no-reply@crecik.com>',
  };

  it('fails in production when APP_URL is missing', () => {
    const { error } = envValidationSchema.validate(prodEnv, {
      abortEarly: false,
    });
    expect(error?.message).toContain('APP_URL');
  });

  it('fails in production when APP_URL is empty', () => {
    const { error } = envValidationSchema.validate(
      { ...prodEnv, APP_URL: '' },
      { abortEarly: false },
    );
    expect(error?.message).toContain('APP_URL');
  });

  it('fails in production when APP_URL is not a valid URI', () => {
    const { error } = envValidationSchema.validate(
      { ...prodEnv, APP_URL: 'not a url' },
      { abortEarly: false },
    );
    expect(error?.message).toContain('APP_URL');
  });

  it('passes in production when APP_URL is a URL', () => {
    const { error } = envValidationSchema.validate(
      { ...prodEnv, APP_URL: 'https://crecik.com' },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });

  it('allows empty APP_URL outside production', () => {
    const { error } = envValidationSchema.validate(
      { ...baseEnv, NODE_ENV: 'development' },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });
});

describe('envValidationSchema — MAIL_FROM', () => {
  const prodEnv = {
    ...baseEnv,
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://app.example.com',
    APP_URL: 'https://crecik.com',
  };

  it('fails in production when MAIL_FROM is missing', () => {
    const { error } = envValidationSchema.validate(prodEnv, {
      abortEarly: false,
    });
    expect(error?.message).toContain('MAIL_FROM');
  });

  it('fails in production when MAIL_FROM is empty', () => {
    const { error } = envValidationSchema.validate(
      { ...prodEnv, MAIL_FROM: '' },
      { abortEarly: false },
    );
    expect(error?.message).toContain('MAIL_FROM');
  });

  it('passes in production when MAIL_FROM is set', () => {
    const { error } = envValidationSchema.validate(
      { ...prodEnv, MAIL_FROM: 'Crecik <no-reply@crecik.com>' },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });

  it('allows empty MAIL_FROM outside production', () => {
    const { error } = envValidationSchema.validate(
      { ...baseEnv, NODE_ENV: 'development' },
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });
});
