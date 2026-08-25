-- Keep public.users in step with Supabase Auth.
--
-- Signup happens in auth.users, which Prisma does not own. Without this bridge
-- every new account would be invisible to the app: no User row, so app_user_id()
-- returns NULL and every RLS policy denies. Doing it in a trigger rather than in
-- application code means it also holds for magic links, OAuth, and users created
-- from the Supabase dashboard (PRD §8.1 lists four sign-in methods).
--
-- The trigger is SECURITY DEFINER because it writes to public tables while
-- running in the auth service's transaction.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_user_id UUID;
  student_role_id UUID;
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::JSONB);
  first_name TEXT;
  last_name TEXT;
  full_name TEXT;
BEGIN
  -- OAuth providers hand back a single display name; email/password signup sends
  -- first/last explicitly. Accept either shape.
  full_name := COALESCE(meta ->> 'full_name', meta ->> 'name', '');
  first_name := COALESCE(
    NULLIF(meta ->> 'first_name', ''),
    NULLIF(SPLIT_PART(full_name, ' ', 1), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );
  last_name := COALESCE(
    NULLIF(meta ->> 'last_name', ''),
    NULLIF(NULLIF(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1), full_name), ''),
    ''
  );

  INSERT INTO public.users ("id", "supabaseUserId", "email", "emailVerified", "status", "updatedAt")
  VALUES (
    gen_random_uuid(),
    NEW.id,
    NEW.email,
    NEW.email_confirmed_at IS NOT NULL,
    'ACTIVE',
    NOW()
  )
  -- Idempotent: a re-fired trigger or a pre-provisioned row must not error.
  ON CONFLICT ("supabaseUserId") DO UPDATE
    SET "email" = EXCLUDED."email",
        "updatedAt" = NOW()
  RETURNING "id" INTO new_user_id;

  INSERT INTO public.profiles ("id", "userId", "firstName", "lastName", "avatarUrl", "updatedAt")
  VALUES (
    gen_random_uuid(),
    new_user_id,
    first_name,
    last_name,
    NULLIF(meta ->> 'avatar_url', ''),
    NOW()
  )
  ON CONFLICT ("userId") DO NOTHING;

  -- Everyone starts as a Student. Instructor/Admin are granted by an admin
  -- (PRD §13.2 "approve instructors"), never self-assigned at signup.
  SELECT "id" INTO student_role_id FROM public.roles WHERE "name" = 'STUDENT';

  IF student_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles ("id", "userId", "roleId")
    VALUES (gen_random_uuid(), new_user_id, student_role_id)
    ON CONFLICT ("userId", "roleId") DO NOTHING;
  ELSE
    -- Seed has not run. Warn rather than abort: blocking signup over a missing
    -- lookup row would be a worse failure than a role-less user an admin can fix.
    RAISE WARNING 'handle_new_auth_user: STUDENT role missing, user % created without a role', new_user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Mirror email changes and email confirmation back to public.users, so the
-- app's copy never drifts from the auth record.
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users
  SET "email" = NEW.email,
      "emailVerified" = NEW.email_confirmed_at IS NOT NULL,
      "lastLoginAt" = COALESCE(NEW.last_sign_in_at, "lastLoginAt"),
      "updatedAt" = NOW()
  WHERE "supabaseUserId" = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email, email_confirmed_at, last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_updated();

-- Deleting an auth user soft-deletes the app user. Hard deletion would cascade
-- through enrollments and certificates and destroy the audit trail; NDPA erasure
-- is a redaction path, not a DROP (PRD §12.1, §15).
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users
  SET "status" = 'DEACTIVATED',
      "deletedAt" = NOW(),
      "supabaseUserId" = NULL,
      "updatedAt" = NOW()
  WHERE "supabaseUserId" = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_deleted();

-- Backfill any accounts that signed up before this migration.
INSERT INTO public.users ("id", "supabaseUserId", "email", "emailVerified", "status", "updatedAt")
SELECT gen_random_uuid(), au.id, au.email, au.email_confirmed_at IS NOT NULL, 'ACTIVE', NOW()
FROM auth.users au
LEFT JOIN public.users pu ON pu."supabaseUserId" = au.id
WHERE pu."id" IS NULL AND au.email IS NOT NULL;
