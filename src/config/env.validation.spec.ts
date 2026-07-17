import { envValidationSchema } from './env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/coinflow',
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
