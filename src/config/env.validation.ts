import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(8080),

  DATABASE_URL: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRATION_MS: Joi.number().default(3600000),
  JWT_REMEMBER_ME_EXPIRATION_MS: Joi.number().default(604800000),
  JWT_ISSUER: Joi.string().default('crecik'),

  // In production the API must never fall back to allow-all CORS with
  // credentials, so the allowed origins are mandatory there.
  CORS_ORIGIN: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).required().messages({
      'any.required':
        'CORS_ORIGIN is required in production (comma-separated list of allowed origins)',
      'string.empty':
        'CORS_ORIGIN is required in production (comma-separated list of allowed origins)',
    }),
    otherwise: Joi.string().allow('').default(''),
  }),

  // Password-reset links are built from APP_URL; in production it must point
  // at the real frontend instead of the localhost dev fallback.
  APP_URL: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri().required().messages({
      'any.required':
        'APP_URL is required in production (frontend base URL used in password-reset links)',
      'string.empty':
        'APP_URL is required in production (frontend base URL used in password-reset links)',
      'string.uri':
        'APP_URL must be a valid URL (frontend base URL used in password-reset links)',
    }),
    otherwise: Joi.string().allow('').default(''),
  }),

  AAAPIS_TOKEN: Joi.string().allow('').default(''),
});
