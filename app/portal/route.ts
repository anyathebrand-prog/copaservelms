import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dashboardPathFor } from "@/lib/roles";

/**
 * GET /portal — send a signed-in person to their own dashboard.
 *
 * Sign-in cannot decide this itself. The browser knows the session but not the
 * roles, which live in the database behind RLS, so the client form previously
 * had to guess and always guessed "/student". An admin therefore landed on the
 * student dashboard and, with no cross-area link in the nav, had no way to
 * reach their own — which is why all three dashboards looked identical.
 *
 * Resolving it here keeps one rule in one place, shared by password sign-in,
 * magic links, and OAuth.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  return NextResponse.redirect(`${origin}${dashboardPathFor(user)}`);
}
