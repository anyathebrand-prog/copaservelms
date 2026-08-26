// Prisma CLI configuration (Prisma 7).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations must use a direct (non-PgBouncer) connection — Supabase port 5432.
    // Runtime queries go through the pooled DATABASE_URL via the adapter in lib/prisma.ts.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
