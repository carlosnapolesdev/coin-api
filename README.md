# coin-api

[![CI](https://github.com/carlosnapolesdev/coin-api/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosnapolesdev/coin-api/actions/workflows/ci.yml)

REST API for **CoinFlow**, a personal finance management app. It handles authentication, multi-currency accounts, transactions (with CSV import/export), budgets, savings goals, recurring transactions, and reports.

Built with [NestJS](https://nestjs.com) 11, [Prisma](https://www.prisma.io) 7, and PostgreSQL.

## Tech stack

- **Framework:** NestJS 11 (Express platform)
- **Database:** PostgreSQL via Prisma 7 (`PrismaPg` driver adapter)
- **Auth:** Passport JWT (HS256), bcrypt password hashing
- **Validation:** class-validator DTOs + Joi for environment variables
- **Logging:** nestjs-pino (pretty-printed in development)
- **Docs:** Swagger (OpenAPI) at `/docs` — non-production only
- **Tests:** Jest (unit + e2e with supertest)

## Requirements

- Node.js >= 22.15 (see `.nvmrc`)
- A running PostgreSQL instance

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env    # then set DATABASE_URL and JWT_SECRET (min 32 chars)

# 3. Apply database migrations
npx prisma migrate deploy

# 4. Seed the currency catalog and default categories (idempotent)
npm run seed            # currencies require AAAPIS_TOKEN in .env

# 5. Run in watch mode
npm run start:dev
```

The API listens on `http://localhost:8080` with global prefix `/api`. Swagger UI is available at `http://localhost:8080/docs`.

## Environment variables

Validated at startup by Joi (`src/config/env.validation.ts`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | JWT signing secret, min 32 characters |
| `JWT_EXPIRATION_MS` | no | `3600000` | Token lifetime (1 h) |
| `JWT_REMEMBER_ME_EXPIRATION_MS` | no | `604800000` | "Remember me" token lifetime (7 d) |
| `JWT_ISSUER` | no | `coinflow` | JWT `iss` claim |
| `CORS_ORIGIN` | in production | *(all, dev only)* | Comma-separated allowed origins; startup fails in production if unset |
| `APP_URL` | no | `http://localhost:5173` | Frontend base URL used in password-reset links |
| `AAAPIS_TOKEN` | no | — | aaapis.com token, used only by the currency seed |
| `PORT` | no | `8080` | HTTP port |
| `NODE_ENV` | no | `development` | `development` / `production` / `test` |

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Development server with watch mode |
| `npm run build` / `npm run start:prod` | Compile and run the production build |
| `npm test` / `npm run test:watch` / `npm run test:cov` | Unit tests (`src/**/*.spec.ts`) |
| `npm run test:e2e` | End-to-end tests (`test/*.e2e-spec.ts`, run serially) |
| `npm run lint` / `npm run format` | ESLint (with autofix) / Prettier |
| `npm run seed` | CLI seeder (currencies, categories, translations) |

## API overview

All routes are prefixed with `/api` and require a JWT bearer token, except the ones marked public. Full request/response documentation lives in Swagger.

| Resource | Base path | Endpoints |
|---|---|---|
| Auth | `/api/auth` | `register`, `login` (public, throttled), `me`, `forgot-password`, `reset-password` |
| Currencies | `/api/currencies` | Catalog (public) |
| User currencies | `/api/users/me/currencies` | CRUD, bulk replace (`PUT`), `exchange-rate` |
| Categories | `/api/categories` | Localized catalog (public) |
| User categories | `/api/users/me/categories` | CRUD over the user's category tree |
| Accounts | `/api/users/me/accounts` | CRUD, net-worth `summary` |
| Transactions | `/api/users/me/transactions` | CRUD, `search`, CSV `export`, CSV `import/preview` + `import/commit` |
| Budgets | `/api/users/me/budgets` | CRUD |
| Goals | `/api/users/me/goals` | CRUD |
| Recurring | `/api/users/me/recurring` | CRUD, manual `:id/run` |
| Reports | `/api/users/me/reports` | `income-expense`, `categories`, `net-worth` |
| Health | `/api/health` | Terminus healthcheck (DB ping) |

Errors follow a single JSON contract produced by the global exception filter:

```json
{ "timestamp", "status", "error", "message", "path", "validationErrors" }
```

## Background jobs

A daily scheduler (`06:00` server time, `@nestjs/schedule`) materializes due recurring transactions. Any recurring rule can also be executed on demand via `POST /api/users/me/recurring/:id/run`.

## Database & migrations

Prisma 7 splits configuration: the CLI reads `prisma.config.ts` (datasource URL), while the runtime `PrismaService` connects through the `PrismaPg` adapter. Migrations live in `prisma/migrations` — create new ones with:

```bash
npx prisma migrate dev --name <change>
```

## Docker

The multi-stage `Dockerfile` builds the app and runs `prisma migrate deploy` on container start. `docker-compose.yml` expects external `web` and `backend` networks and a `postgres` service provided by the host stack, with secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, …) injected via environment.

```bash
docker compose up -d --build
```
