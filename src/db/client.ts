import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const fallbackDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/campus_dining_api';

let prisma: PrismaClient | undefined;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? fallbackDatabaseUrl;
}

export function getPrisma() {
  if (!prisma) {
    const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
    const queryLogging = process.env.PRISMA_LOG_QUERIES === 'true';
    prisma = new PrismaClient({
      adapter,
      log: queryLogging ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  return prisma;
}

export async function checkDatabaseConnection() {
  const startedAt = Date.now();
  await getPrisma().$queryRaw`SELECT 1`;
  return {
    database: 'postgres',
    latencyMs: Date.now() - startedAt,
  };
}

export async function disconnectPrisma() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = undefined;
}
