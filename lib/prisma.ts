import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

// Prisma 7 requires a driver adapter. Runtime queries use the pooled Supabase
// connection (DATABASE_URL); Prisma Migrate uses DIRECT_URL — see prisma7.config.ts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Reuse one client across hot reloads in dev; Next.js re-evaluates modules per request.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
