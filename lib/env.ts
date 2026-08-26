/**
 * Fail fast, and say what is missing.
 *
 * Supabase's client constructors throw "supabaseUrl is required" when handed an
 * empty string, which gives no hint about which variable or which file. Since
 * middleware runs on every request, a missing key otherwise surfaces as a blank
 * 500 on every page.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and fill in the Supabase values from your project's Connect dialog (Project Settings → API).`,
    );
  }

  return value;
}
