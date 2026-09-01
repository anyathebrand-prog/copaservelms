/**
 * Render the authenticated portal pages against a running server.
 *
 * Types and a successful build do not exercise these routes: they are dynamic,
 * so nothing renders them until a signed-in request arrives. That is how a
 * server/client boundary violation reached a deployment while `next build`
 * reported success.
 *
 *   npx tsx --env-file=.env.local <this file> http://127.0.0.1:PORT
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://127.0.0.1:3200";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.copaserve.test";
const PASSWORD = process.env.DEMO_PASSWORD ?? "CopaServe-Demo-2026!";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** @supabase/ssr stores the session as base64 JSON, chunked past ~3180 chars. */
function sessionCookies(session: unknown): string {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

  if (value.length <= 3180) return `${name}=${value}`;

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  return chunks.map((chunk, index) => `${name}.${index}=${chunk}`).join("; ");
}

async function main() {
  const supabase = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);

  const cookie = sessionCookies(data.session);
  const paths = ["/portal", "/admin", "/instructor", "/student", "/admin/cohorts", "/admin/users", "/admin/invoices", "/admin/waitlist"];

  let failures = 0;

  for (const path of paths) {
    const response = await fetch(`${BASE}${path}`, {
      headers: { cookie },
      redirect: "manual",
    });

    const body = response.status < 400 ? await response.text() : "";
    // Next serves a 500 page for a render error, but a digest in the body is
    // the surer signal — a page can respond 200 and still have thrown.
    const threw = /application error|digest[&"']?:|couldn.t load/i.test(body);
    const ok = response.status < 400 && !threw;

    if (!ok) failures += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${path.padEnd(18)} ${response.status}` +
        (response.status >= 300 && response.status < 400
          ? ` -> ${response.headers.get("location")}`
          : "") +
        (threw ? "  (render error in body)" : "") +
        (ok ? `  ${body.length} bytes` : ""),
    );
  }

  console.log(`\n${paths.length - failures}/${paths.length} rendered`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
