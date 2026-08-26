import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

let warned = false;

/**
 * Refresh the Supabase session on every matched request.
 *
 * Server Components cannot write cookies, so without this the access token
 * would expire mid-session and users would be silently logged out. The
 * refreshed cookies have to be written onto the *same* response object that is
 * returned, which is why the response is threaded through rather than rebuilt.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Degrade rather than throw when auth is unconfigured. Middleware runs on
  // every request, so throwing here would take the public marketing site and
  // every other unauthenticated page down with it. Reporting "signed out"
  // fails closed: protected routes still redirect to login, and nothing
  // privileged is exposed.
  if (!url || !anonKey) {
    if (!warned) {
      warned = true;
      console.warn(
        "[auth] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
          "Every request is being treated as signed out; sign-in will not work until they are configured.",
      );
    }
    return { response, userId: null };
  }

  let mutableResponse = response;

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          mutableResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            mutableResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with the auth server; getSession() would
  // simply trust the cookie, which is not safe for an access decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: mutableResponse, userId: user?.id ?? null };
}
