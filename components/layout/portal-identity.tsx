import { AreaSwitcher } from "@/components/layout/area-switcher";
import { requireUser } from "@/lib/roles";

/**
 * The parts of the portal header that need to know who is signed in.
 *
 * Split out of the layout for one specific reason. A layout that awaits
 * runtime data — cookies, a session lookup — suppresses loading.tsx entirely:
 *
 *   "If the layout accesses uncached or runtime data (e.g. cookies(),
 *    headers(), or uncached fetches), loading.js will not show a fallback."
 *   — next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md
 *
 * PortalLayout awaited requireUser() at the top level, so every dashboard
 * navigation blocked on the session lookup before anything could render and
 * the loading state never appeared once. Behind Suspense the shell paints
 * immediately and only these two chips wait.
 *
 * This is chrome, not a guard. Every portal page calls requireUser or
 * requireRole for itself and the middleware gates the three prefixes, so
 * nothing here is what keeps a stranger out.
 *
 * getCurrentUser is wrapped in React's cache(), so the two components below
 * are one session lookup per request, not two.
 */

export async function PortalAreaSwitcher() {
  const user = await requireUser();
  return <AreaSwitcher roles={user.roles} />;
}

export async function PortalUserEmail() {
  // Email rather than a display name: the name lives on Profile, and fetching
  // it here would add a query to every page in the portal for one label.
  const user = await requireUser();
  return (
    <span className="hidden max-w-48 truncate text-sm text-white/50 sm:inline">{user.email}</span>
  );
}

/**
 * Fixed-size stand-ins.
 *
 * The header is a flex row, so a fallback that collapses to nothing would let
 * the logo and the sign-out button slide as the real content lands.
 */
export function AreaSwitcherFallback() {
  return <span aria-hidden className="h-9 w-44 rounded-full bg-white/5" />;
}

export function UserEmailFallback() {
  return <span aria-hidden className="hidden h-4 w-32 rounded bg-white/5 sm:inline-block" />;
}
