-- Close the enquiries table to the public anon key.
--
-- Every other table in this schema has row-level security on; this one was
-- added by a Prisma migration, and Prisma does not write RLS. The gap was not
-- theoretical: with the anon key that ships in every page, a stranger could
-- read every corporate enquiry — names, work emails, phone numbers and whatever
-- was typed in the message — and insert fabricated ones.
--
-- No policies, deliberately. Nothing in the browser has any business reading or
-- writing this table: the public form posts through a server action, and the
-- admin page reads it through Prisma. Both connect as the table owner, which
-- bypasses RLS, so enabling it costs the application nothing and closes
-- PostgREST entirely.

ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;
