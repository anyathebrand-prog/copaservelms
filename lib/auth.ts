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
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
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

  return {
    id: appUser.id,
    email: appUser.email,
    roles: appUser.roles.map((r) => r.role.name),
  };
}

export function isAdmin(user: CurrentUser): boolean {
  return user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN");
}
