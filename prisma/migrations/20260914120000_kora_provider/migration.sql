-- Add Kora as a payment provider.
--
-- ADD VALUE rather than recreating the type: the enum is referenced by
-- Payment.provider, and dropping a type in use would take the column with it.
-- IF NOT EXISTS so re-running against a database that already has it is a
-- no-op rather than an error.
--
-- BEFORE 'MANUAL' keeps the gateways together and manual bank transfer last,
-- which is the order availableProviders() offers them in.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'KORA' BEFORE 'MANUAL';
