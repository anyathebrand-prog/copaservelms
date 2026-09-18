"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Sign someone in from tokens in the URL fragment, wherever they land.
 *
 * Supabase's email links in this project can use the implicit flow, which puts
 * the session in the fragment: /page#access_token=…&refresh_token=…. Browsers
 * never send a fragment to the server, so the page renders signed out and the
 * tokens sit unread in the address bar. /auth/callback already forwards such a
 * request to its `next` destination on purpose, so the fragment arrives — but
 * only the reset-password page ever read it.
 *
 * Everywhere else the link was simply spent. A new learner confirming their
 * email reached /portal, which redirected them to sign in; someone applying
 * to teach reached /teach signed out, with no questions to answer. Both had a
 * valid session in their address bar the whole time.
 *
 * This reads it once, on whatever page it arrived, then:
 *   - removes the tokens from the address bar — they are credentials, and
 *     should not sit in history or leak through a copied URL;
 *   - on the sign-in page, continues to its `next`, since a server redirect
 *     from a protected page will have carried the fragment there;
 *   - anywhere else, reloads the page, so it renders signed in.
 *
 * Not on /reset-password, which reads the fragment itself and needs to know it
 * arrived from a recovery link.
 */
export function FragmentSession() {
  useEffect(() => {
    if (window.location.pathname === "/reset-password") return;

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    const supabase = createSupabaseBrowserClient();

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        const { pathname, search } = window.location;
        window.history.replaceState(null, "", pathname + search);
        if (error) return;

        // A full load, not router.refresh(): the soft refresh was tested and
        // left /teach rendered signed out, because the server did not yet see
        // the session the browser had just stored. A real navigation sends the
        // cookie with the request, so the page arrives signed in. It costs one
        // extra load, only ever on arrival from an email link.
        if (pathname === "/login" || pathname === "/signup") {
          const next = new URLSearchParams(search).get("next") ?? "/portal";
          // Only relative paths, or a crafted ?next= becomes an open redirect.
          window.location.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/portal");
          return;
        }

        window.location.replace(pathname + search);
      })
      .catch(() => {
        // A failed hand-off leaves the page as it was: signed out, with the
        // ordinary way to sign in still there.
      });
  }, []);

  return null;
}
