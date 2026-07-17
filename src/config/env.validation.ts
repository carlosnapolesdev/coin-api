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
  JWT_ISSUER: Joi.string().default('coinflow'),

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

  APP_URL: Joi.string().allow('').default(''),

  AAAPIS_TOKEN: Joi.string().allow('').default(''),
});
