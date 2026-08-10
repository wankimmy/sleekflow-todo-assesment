import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrismaClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return {
    prisma: new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    }),
    pool,
  };
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const created = globalForPrisma.prisma
  ? { prisma: globalForPrisma.prisma, pool: globalForPrisma.pgPool }
  : createPrismaClient(connectionString);

export const prisma = created.prisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = created.pool;
}

export function createPrismaClientFromUrl(url: string) {
  return createPrismaClient(url).prisma;
}
