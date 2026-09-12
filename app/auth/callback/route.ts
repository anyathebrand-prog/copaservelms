import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where every email and OAuth link lands.
 *
 * Supabase can deliver a verified identity in three different shapes, and this
 * route used to understand only one of them:
 *
 *   ?code=...                 PKCE. OAuth, and any email link for a flow that
 *                             started in this browser.
 *   ?token_hash=...&type=...  The server-side pattern, and what an email
 *                             template using {{ .TokenHash }} produces.
 *   #access_token=...         The implicit flow. The tokens are in the URL
 *                             fragment, which browsers never send to a server,
 *                             so this route cannot see them at all.
 *
 * The third one is why a real recovery link failed. With no `code` present
 * this redirected to /login?error=missing_code — and because a fragment
 * survives a redirect, the tokens arrived on the sign-in page, where nothing
 * reads them. The person saw an error and their reset link was spent.
 *
 * So a request carrying neither parameter is now forwarded to `next` rather
 * than rejected: the fragment travels with it, and the destination picks it up
 * client-side. A genuinely empty request reaches the destination without a
 * session, which each destination already handles.
 */

/** Supabase's own list, so an unexpected `type` cannot be passed through. */
const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/portal";

  // Only relative paths, or this becomes an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/portal";

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  if (tokenHash && type && OTP_TYPES.includes(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  // Possibly an implicit-flow link whose tokens are in the fragment. Forward
  // rather than reject, so the fragment reaches somewhere that can read it.
  return NextResponse.redirect(`${origin}${safeNext}`);
}
