import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';

dotenv.config();

// Used only by Prisma CLI commands (db pull, migrate status, migrate resolve, etc.)
// Runtime adapter is configured in PrismaService.
export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
});
