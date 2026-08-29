import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPathFor } from "@/lib/roles";

/**
 * GET /portal — send a signed-in person to their own dashboard.
 *
 * Sign-in cannot decide this itself: the browser knows the session but not the
 * roles, which live in the database behind RLS. Resolving it here keeps one
 * rule in one place, shared by password sign-in, magic links, and OAuth.
 *
 * The subtlety is that "signed in" means two different things either side of
 * this route. Middleware only sees the Supabase token. getCurrentUser()
 * additionally requires an app user row that is not suspended, deactivated, or
 * deleted. Anyone holding a valid token without a usable row therefore falls
 * between them — and bouncing such a person to /login produces an infinite
 * loop, because middleware sees their token and sends them straight back.
 *
 * So a broken link between the two is ended rather than redirected around:
 * the session is cleared, which makes the next request unambiguously signed
 * out and gives the person an explanation instead of a browser error.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // No session at all: /login is safe, because middleware will not bounce back.
  if (!authUser) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const user = await getCurrentUser();

  if (!user) {
    // A token without a usable account. Sign out so the loop cannot re-form,
    // and say why rather than leaving them at a dead end.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=account_unavailable`);
  }

  return NextResponse.redirect(`${origin}${dashboardPathFor(user)}`);
}
