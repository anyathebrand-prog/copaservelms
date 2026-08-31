-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "institutionName" TEXT NOT NULL DEFAULT 'Business Intelligence Technologies Limited',
    "supportEmail" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0a510e',
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Exactly one row, enforced by the database rather than by convention.
--
-- A settings table that permits a second row eventually has one, and then
-- which row applies depends on whatever order the query happened to return.
-- ---------------------------------------------------------------------------

ALTER TABLE "platform_settings"
  ADD CONSTRAINT "platform_settings_singleton" CHECK ("id" = 'singleton');

INSERT INTO "platform_settings" ("id", "updatedAt") VALUES ('singleton', NOW())
  ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS (PRD §6.2 — no table ships without policies).
--
-- Readable by anyone signed in, since the institution name and mark appear
-- throughout the app; writable only by an admin.
-- ---------------------------------------------------------------------------

ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_read" ON "platform_settings"
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "platform_settings_admin_write" ON "platform_settings"
  FOR ALL TO authenticated
  USING (public.app_is_admin())
  WITH CHECK (public.app_is_admin());
