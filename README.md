# coin-api

[![CI](https://github.com/carlosnapolesdev/coin-api/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosnapolesdev/coin-api/actions/workflows/ci.yml)

REST API for **Crecik**, a personal finance management app. It handles authentication (password + Google Sign-In, email verification), multi-currency accounts with reconciliation, transactions (CSV import/export, tags, receipt attachments), budgets, savings goals, recurring transactions, reports, and in-app notifications.

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
| `JWT_ISSUER` | no | `crecik` | JWT `iss` claim |
| `CORS_ORIGIN` | in production | *(all, dev only)* | Comma-separated allowed origins; startup fails in production if unset |
| `APP_URL` | no | `http://localhost:5173` | Frontend base URL used in password-reset and verification links |
| `GOOGLE_CLIENT_ID` | in production | — | OAuth client id: verifies Google ID tokens (`aud`) and is served publicly via `GET /auth/google/config` |
| `MAIL_FROM` | in production | — | Verified Resend sender, e.g. `Crecik <no-reply@crecik.com>` |
| `RESEND_API_KEY` | no* | — | Resend API key. Not Joi-validated, but without it every send is skipped with a warning instead of failing — *effectively required for email to work* |
| `CLIENT_ERRORS_DIGEST_TO` | no | — | Recipient of the daily digest of new client-side errors (`npm run digest:send`); digest is skipped and logged if unset |
| `UPLOAD_DIR` | no | `./uploads` | Directory where transaction attachments are stored on disk |
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
| `npm run digest:send [-- --dry]` | Send the daily digest of new client-side errors on demand |

## API overview

All routes are prefixed with `/api` and require a JWT bearer token, except the ones marked public. Full request/response documentation lives in Swagger.

| Resource | Base path | Endpoints |
|---|---|---|
| Auth | `/api/auth` | `register`, `login`, `google` (Google ID-token sign-in), `google/config`, `me`, `forgot-password`, `reset-password`, `verify-email`, `resend-verification` — all public and throttled except `me` |
| Users | `/api/users/me` | Update profile, update onboarding state, change password |
| Currencies | `/api/currencies` | Catalog (public) |
| User currencies | `/api/users/me/currencies` | CRUD, bulk replace (`PUT`), `exchange-rate` |
| Categories | `/api/categories` | Localized catalog (public) |
| User categories | `/api/users/me/categories` | CRUD over the user's category tree |
| Accounts | `/api/users/me/accounts` | CRUD, net-worth `summary` |
| Reconciliations | `/api/users/me/accounts/:accountId/reconciliations` | Open a reconciliation, get its summary, complete it |
| Transactions | `/api/users/me/transactions` | CRUD, `search`, CSV `export`, CSV `import/preview` + `import/commit` |
| Attachments | `/api/users/me/transactions/:id/attachments` | Upload (5 MB limit), list, download, delete receipts |
| Tags | `/api/users/me/tags` | List with per-tag usage count, rename, delete |
| Budgets | `/api/users/me/budgets` | CRUD |
| Goals | `/api/users/me/goals` | CRUD |
| Recurring | `/api/users/me/recurring` | CRUD, manual `:id/run` |
| Reports | `/api/users/me/reports` | `income-expense`, `categories`, `net-worth` |
| Notifications | `/api/users/me/notifications` | List (optional `unread` filter), mark read, mark all read |
| Client errors | `/api/client-errors` | Public ingestion endpoint for the frontend's error reporter; deduped by fingerprint and summarized in a daily email digest |
| Health | `/api/health` | Terminus healthcheck (DB ping) |

Errors follow a single JSON contract produced by the global exception filter:

```json
{ "timestamp", "status", "error", "message", "path", "validationErrors" }
```

## Authentication & security

- **JWT (HS256)**, `sub` claim is the user id. Access tokens expire in 1h by default (7d with "remember me").
- **Google Sign-In** verifies the ID token's signature, `iss`, `aud` and expiration server-side (`google-auth-library`) — no authorization-code flow, no client secret. A Google sign-in auto-links to an existing password account when the (Google-verified) email matches.
- **Email verification is a hard gate**: `login` rejects unverified accounts with `403 EMAIL_NOT_VERIFIED`. Verification and password-reset tokens live in their own tables with a 24h TTL and a resend limit of 3/hour per address.
- **Session revocation on password change.** `credentialsChangedAt` is compared against the token's `iat` on every request (`jwt.strategy.ts`), no extra query needed. Changing the password from Settings re-authenticates the current session and signs out every other device; a password-reset link signs out all of them.
- **Per-endpoint throttling** (`@nestjs/throttler`): 5/min on login and Google sign-in, 3/min on forgot-password and resend-verification, 10/min on register/reset/verify.
- **CSV export is formula-injection-safe**: free-text cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading quote (`escape-formula.ts`); server-generated columns are left untouched.

## Background jobs

A daily scheduler (`06:00` server time, `@nestjs/schedule`) materializes due recurring transactions. Any recurring rule can also be executed on demand via `POST /api/users/me/recurring/:id/run`.

## Database & migrations

Prisma 7 splits configuration: the CLI reads `prisma.config.ts` (datasource URL), while the runtime `PrismaService` connects through the `PrismaPg` adapter. Migrations live in `prisma/migrations` — create new ones with:

```bash
npx prisma migrate dev --name <change>
```

## Docker

The multi-stage `Dockerfile` builds the app and runs `prisma migrate deploy` on container start. `docker-compose.yml` runs only the API: it expects external `web` and `backend` networks, a `postgres` container provided by the host stack on `backend` (with a `crecik` database created in it, see below), and required secrets injected via environment — `POSTGRES_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN`, `APP_URL`, `GOOGLE_CLIENT_ID`, `MAIL_FROM`, and `RESEND_API_KEY` — all fail closed at `compose up` if unset, rather than at the first request that needs them. File uploads persist in the named `uploads` volume.

The host-stack postgres only creates its default `postgres` database, so create the app database once before the first deploy:

```bash
docker exec postgres psql -U postgres -c 'CREATE DATABASE crecik;'
```

```bash
docker compose up -d --build
```

After the first boot, seed the currency and category catalogs (requires `AAAPIS_TOKEN`; safe to re-run — each seeder skips tables that already contain data):

```bash
docker exec coin-api node dist/console.js seed
```

## License

MIT © Carlos Nápoles Avila
