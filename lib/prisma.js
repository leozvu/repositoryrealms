import { PrismaClient } from '@prisma/client';
import { runtimeDatabaseUrl } from './database-runtime.js';

const globalForPrisma = globalThis;
const databaseUrl = runtimeDatabaseUrl(process.env.DATABASE_URL);

export const prisma = globalForPrisma.prisma ?? new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

// Reuse the client in production too. A Vercel instance is isolated already,
// while creating a new Prisma pool for each module evaluation leaks scarce
// Postgres connections and can take authentication and rollout APIs down.
globalForPrisma.prisma = prisma;
