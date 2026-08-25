"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/env";

/**
 * Supabase client for Client Components.
 *
 * Carries the anon key, so it is only ever trusted for authentication flows —
 * every table it could reach is governed by RLS, and application data is read
 * through server routes rather than from here.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
