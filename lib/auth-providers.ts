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

/**
 * The providers we offer, whatever else Supabase happens to support.
 *
 * Deliberately a short list rather than everything available. Consumer
 * Microsoft accounts were dropped: this platform's learners are Nigerian
 * compliance and governance professionals, for whom a personal Outlook account
 * is not the identity they arrive with, and an unused button is one more thing
 * to keep working.
 *
 * Note that this is not the same decision as enterprise SSO. A bank requiring
 * its staff to sign in against its own Entra ID tenant is SAML, a different
 * mechanism aimed at a different buyer, and nothing here forecloses it.
 */
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
};

export type EnabledProvider = { id: string; label: string };

export type AuthMethods = {
  providers: EnabledProvider[];
  /** Whether Supabase will accept a phone sign-in at all. */
  phone: boolean;
};

/**
 * Ask Supabase what it will accept.
 *
 * Revalidated rather than fetched per request: this changes when someone edits
 * a dashboard setting, which is roughly never, and the sign-in page should stay
 * cacheable. Enabling a method shows up within five minutes.
 */
export async function getAuthMethods(): Promise<AuthMethods> {
  const none: AuthMethods = { providers: [], phone: false };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return none;

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
    });
    if (!response.ok) return none;

    const settings = (await response.json()) as { external?: Record<string, boolean> };
    const external = settings.external ?? {};

    return {
      providers: Object.entries(PROVIDER_LABELS)
        .filter(([id]) => external[id] === true)
        .map(([id, label]) => ({ id, label })),
      // Phone sign-in also needs the SMS hook pointed at this deployment.
      // Without it Supabase accepts the request and no message is ever sent,
      // which looks identical to a slow network from the learner's side.
      phone: external.phone === true,
    };
  } catch {
    // Sign-in must not depend on this call. Email and password are the primary
    // path, and hiding a working button is a far smaller harm than offering one
    // that dead-ends on someone else's domain.
    return none;
  }
}
