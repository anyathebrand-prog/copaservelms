-- Supabase's default privileges grant anon and authenticated full DML on every
-- table created in `public` — including Prisma's own _prisma_migrations ledger,
-- which arrived with SELECT/INSERT/UPDATE/DELETE/TRUNCATE for anon. Anyone
-- holding the publishable anon key could have rewritten or truncated migration
-- history. Nothing outside the migration engine (which connects as the owner)
-- has any business touching it.

REVOKE ALL ON TABLE "_prisma_migrations" FROM anon, authenticated;

-- Defence in depth: with RLS on and no policy, even a future stray GRANT
-- leaves the table returning zero rows to those roles.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
