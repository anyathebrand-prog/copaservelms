"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { browserSupabaseConfigured, createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * The signed-in / signed-out corner of the public header.
 *
 * This is a client component on purpose. Asking the server who the visitor is
 * means reading cookies, and a page that reads cookies cannot be cached — one
 * personalised link made the entire marketing site and catalogue dynamic, so
 * every visitor waited for a round trip to the function region for content
 * that is identical for everyone.
 *
 * Deciding it in the browser lets those pages be prerendered and served from a
 * nearby edge. The signed-in link points at /portal, which resolves the right
 * dashboard server-side, so this component never needs to know the roles.
 */
export function AccountNav({ dark = false }: { dark?: boolean } = {}) {
  // null = not yet known. Rendering the signed-out state immediately would
  // show "Sign in" to someone who is signed in, then flip.
  //
  // When Supabase is unconfigured the answer is known at render time rather
  // than discovered in an effect, so it is the initial value.
  const configured = browserSupabaseConfigured();
  const [signedIn, setSignedIn] = useState<boolean | null>(configured ? null : false);

  useEffect(() => {
    if (!configured) return;

    const supabase = createSupabaseBrowserClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });

    // Keep the header honest if they sign in or out in another tab.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  if (signedIn === null) {
    // Hold the space so the header does not jump when the answer arrives.
    return <div className="h-9 w-32" aria-hidden />;
  }

  // On the dark landing header the brand green is barely distinguishable from
  // the ink behind it, so the button becomes the bright green instead.
  const button = dark
    ? "rounded-full bg-brand-bright px-4 py-2 text-sm font-bold text-brand-ink transition hover:brightness-110"
    : "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110";

  if (signedIn) {
    return (
      <Link href="/portal" className={button}>
        Dashboard
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className={`text-sm font-medium transition ${
          dark ? "text-white/70 hover:text-white" : "hover:text-brand"
        }`}
      >
        Sign in
      </Link>
      <Link href="/signup" className={button}>
        Start Learning
      </Link>
    </>
  );
}
