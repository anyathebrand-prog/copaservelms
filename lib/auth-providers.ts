/**
 * Which social sign-in providers are actually switched on.
 *
 * Supabase publishes this at /auth/v1/settings, so the sign-in page can show
 * the buttons that work instead of the buttons we hope work.
 *
 * This exists because guessing was worse than useless. `signInWithOAuth` does
 * not return an error for a provider that is turned off — it navigates the
 * whole browser to Supabase's authorize endpoint, which answers with raw JSON:
 *
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 *
 * The person clicking sees that, on a supabase.co URL, having left our site.
 * No amount of error handling in the click handler can catch it, because the
 * page is already gone. The only honest fix is not to offer the button.
 */

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  // Supabase names the Microsoft provider "azure".
  azure: "Microsoft",
};

export type EnabledProvider = { id: string; label: string };

/**
 * Ask Supabase what it will accept.
 *
 * Revalidated rather than fetched per request: this changes when someone edits
 * a dashboard setting, which is roughly never, and the sign-in page should stay
 * cacheable. Enabling a provider shows up within five minutes.
 */
export async function getEnabledProviders(): Promise<EnabledProvider[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];

    const settings = (await response.json()) as { external?: Record<string, boolean> };
    const external = settings.external ?? {};

    return Object.entries(PROVIDER_LABELS)
      .filter(([id]) => external[id] === true)
      .map(([id, label]) => ({ id, label }));
  } catch {
    // Sign-in must not depend on this call. Email and password are the primary
    // path; the worst case here is that a working social button is hidden,
    // which is far better than offering one that dead-ends.
    return [];
  }
}
