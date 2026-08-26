-- Let a pre-provisioned user claim their account at signup.
--
-- Bulk enrolment (PRD §13.2) creates User rows from an email list before those
-- people have ever signed in, so they exist with a NULL supabaseUserId. The
-- original trigger only handled a conflict on supabaseUserId, so when such a
-- person signed up the INSERT hit the *email* unique constraint instead and
-- raised — breaking signup for precisely the users corporate enrolment creates.
--
-- The fix is to look for an unclaimed row with that email first and link it,
-- preserving the enrolments already attached to it.

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

  -- Claim an unclaimed row with this email, if one was pre-provisioned.
  UPDATE public.users
  SET "supabaseUserId" = NEW.id,
      "emailVerified" = NEW.email_confirmed_at IS NOT NULL,
      "status" = CASE WHEN "status" = 'PENDING' THEN 'ACTIVE' ELSE "status" END,
      "updatedAt" = NOW()
  WHERE "email" = NEW.email
    AND "supabaseUserId" IS NULL
    AND "deletedAt" IS NULL
  RETURNING "id" INTO new_user_id;

  -- Otherwise create one, as before.
  IF new_user_id IS NULL THEN
    INSERT INTO public.users ("id", "supabaseUserId", "email", "emailVerified", "status", "updatedAt")
    VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.email,
      NEW.email_confirmed_at IS NOT NULL,
      'ACTIVE',
      NOW()
    )
    ON CONFLICT ("supabaseUserId") DO UPDATE
      SET "email" = EXCLUDED."email",
          "updatedAt" = NOW()
    RETURNING "id" INTO new_user_id;
  END IF;

  INSERT INTO public.profiles ("id", "userId", "firstName", "lastName", "avatarUrl", "updatedAt")
  VALUES (
    gen_random_uuid(),
    new_user_id,
    first_name,
    last_name,
    NULLIF(meta ->> 'avatar_url', ''),
    NOW()
  )
  -- A pre-provisioned user may already have a profile from the import; keep the
  -- name they entered at signup only if the imported one was a placeholder.
  ON CONFLICT ("userId") DO UPDATE
    SET "firstName" = CASE
          WHEN public.profiles."firstName" = '' THEN EXCLUDED."firstName"
          ELSE public.profiles."firstName"
        END,
        "lastName" = CASE
          WHEN public.profiles."lastName" = '' THEN EXCLUDED."lastName"
          ELSE public.profiles."lastName"
        END,
        "updatedAt" = NOW();

  SELECT "id" INTO student_role_id FROM public.roles WHERE "name" = 'STUDENT';

  IF student_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles ("id", "userId", "roleId")
    VALUES (gen_random_uuid(), new_user_id, student_role_id)
    ON CONFLICT ("userId", "roleId") DO NOTHING;
  ELSE
    RAISE WARNING 'handle_new_auth_user: STUDENT role missing, user % created without a role', new_user_id;
  END IF;

  RETURN NEW;
END;
$$;
