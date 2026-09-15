-- Remove the waitlist.
--
-- It existed to collect addresses before the site opened. The site is open, the
-- form is gone from the landing page, and nothing can add to this table any
-- more, so keeping it would mean holding personal data for a purpose that has
-- ended — which is the opposite of what this platform teaches.
--
-- The entries were exported before this ran. Dropping the table is not
-- reversible from the database.

DROP TABLE IF EXISTS "waitlist_entries";
DROP TYPE IF EXISTS "WaitlistStatus";
