"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components.
 *
 * Carries the anon key, so it is only ever trusted for authentication flows —
 * every table it could reach is governed by RLS, and application data is read
 * through server routes rather than from here.
 *
 * The two values are referenced literally rather than through a helper, and
 * that is load-bearing: the bundler replaces `process.env.NEXT_PUBLIC_X` at
 * build time only when it is written out in full. A computed lookup such as
 * `process.env[name]` is never substituted, so it resolves to undefined in the
 * browser however correctly the variable is configured. Reading them through a
 * helper is what previously made the sign-in button throw on click.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether the browser received its configuration at build time. */
export function browserSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function createSupabaseBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing environment variable NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the browser bundle. " +
        "These are inlined at build time, so they must be present when the app is built — and on hosts that " +
        "distinguish build-time from runtime variables, they must not be marked sensitive.",
    );
  }

  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
