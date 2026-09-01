import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { getMfaStatus } from "@/lib/mfa";

/** Role names as stored in the Role table (PRD §8.2). */
export type AppRole = "STUDENT" | "INSTRUCTOR" | "ADMIN" | "SUPER_ADMIN";

/** Where a signed-in user lands, most-privileged portal first. */
export function dashboardPathFor(user: CurrentUser): string {
  if (user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN")) return "/admin";
  if (user.roles.includes("INSTRUCTOR")) return "/instructor";
  return "/student";
}

/**
 * Require a signed-in user in a Server Component, or bounce to login.
 *
 * Middleware already blocks unauthenticated requests to portal routes; this is
 * the second gate, so a missed matcher entry cannot expose a page.
 */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;

  // Distinguish "not signed in" from "has not finished signing in". Sending
  // someone with an outstanding factor to /login would have them re-enter a
  // password, arrive back at the same half-authenticated state, and bounce
  // again — a loop that presents as a blank page.
  const mfa = await getMfaStatus();
  if (mfa.pending) {
    redirect(returnTo ? `/two-factor?next=${encodeURIComponent(returnTo)}` : "/two-factor");
  }

  redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
}

/** Require one of the given roles, or send the user to their own portal. */
export async function requireRole(roles: AppRole[], returnTo?: string): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  const allowed = roles.some((role) => user.roles.includes(role));

  // Redirect rather than 403: a student who wanders into /admin should land
  // somewhere useful, not on an error.
  if (!allowed) redirect(dashboardPathFor(user));

  return user;
}
