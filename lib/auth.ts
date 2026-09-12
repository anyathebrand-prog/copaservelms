import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  roles: string[];
};

/**
 * The app-level user for the current request, or null when unauthenticated.
 *
 * Uses getUser() rather than getSession(): getSession() trusts the cookie as
 * stored, while getUser() revalidates the JWT with the auth server. For an
 * authorisation decision, only the latter is safe.
 *
 * Wrapped in React's cache(), which deduplicates within a single request only.
 * Without it every caller repeats both calls — and a portal page has several:
 * the layout guards, the page guards again, then components ask for the user.
 * Each repeat costs an auth round-trip plus a query, which is the difference
 * between one and five network hops before anything renders.
 *
 * This is per-request memoisation, not a cache across requests: a revoked
 * session or a suspended account is still noticed on the very next request.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const appUser = await prisma.user.findFirst({
    where: { supabaseUserId: user.id, deletedAt: null },
    select: {
      id: true,
      email: true,
      status: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  // A suspended account keeps its auth session until it expires, so status has
  // to be re-checked here rather than trusted from the token.
  if (!appUser || appUser.status === "SUSPENDED" || appUser.status === "DEACTIVATED") {
    return null;
  }

  // A password without the second factor someone enrolled is not a signed-in
  // user. Reported as null rather than as a flag on purpose: thirty-odd call
  // sites treat a non-null result as authenticated, and a flag they could
  // forget to read would make two-factor decorative. Pages that need to tell
  // the difference call getMfaStatus() directly.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") return null;

  return {
    id: appUser.id,
    email: appUser.email,
    roles: appUser.roles.map((r) => r.role.name),
  };
});

export function isAdmin(user: CurrentUser): boolean {
  return user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN");
}

/**
 * Does this account actually have a password?
 *
 * Someone who signed up with Google has no password identity, so asking them
 * for their "current password" is asking for something that has never existed.
 * They get a "set a password" form instead — which is a real feature for them,
 * since it gives them a way in if they ever lose access to the Google account.
 *
 * Identities are read from the auth server rather than inferred from anything
 * stored locally: they change when a provider is linked or unlinked.
 */
export async function hasPasswordIdentity(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;
  return (user.identities ?? []).some((identity) => identity.provider === "email");
}
