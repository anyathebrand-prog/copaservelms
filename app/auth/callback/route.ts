import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth and magic-link landing route.
 *
 * Supabase redirects here with a one-time code, which is exchanged for a
 * session cookie. The auth.users trigger creates the User/Profile/STUDENT role
 * rows, so nothing needs provisioning here.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal";

  // Only relative paths, or this becomes an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/portal";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
