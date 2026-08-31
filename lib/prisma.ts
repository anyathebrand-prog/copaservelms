import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

/**
 * One Prisma client per running instance, shared across every route.
 *
 * Runtime queries use the pooled Supabase connection (DATABASE_URL, PgBouncer
 * on 6543); Prisma Migrate uses DIRECT_URL — see prisma7.config.ts.
 *
 * The client is cached on globalThis in production as well as development, and
 * that is a performance fix rather than a tidiness one. Next.js bundles routes
 * separately, so without it each route evaluates this module and builds its own
 * client and its own connection pool. Every route then pays a fresh TLS
 * handshake to the pooler on its first request, which measured as a fixed
 * ~180ms on top of every page — visible because a two-query page cost the same
 * as a one-query page.
 *
 * Fluid Compute reuses instances across requests, so a client cached here stays
 * warm and later requests reuse an open connection instead of opening one.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // A serverless instance handles a handful of concurrent requests, and the
    // pooler is the thing doing the real pooling. A large local pool would
    // multiply connections across instances for no benefit.
    max: 5,
    // Reclaim sockets that outlive an idle instance rather than holding them
    // against the pooler's limit.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = prisma;
