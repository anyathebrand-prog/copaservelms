/**
 * The application's public base URL.
 *
 * Needed wherever a link leaves the app — email bodies and QR codes — because
 * a relative path is meaningless in an inbox or a camera. Vercel injects
 * VERCEL_PROJECT_PRODUCTION_URL, so a deployment works without configuration,
 * but an explicit NEXT_PUBLIC_APP_URL wins when a custom domain is in use.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/** Make a link absolute for use outside the app. Already-absolute links pass through. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${appUrl()}/${path.replace(/^\/+/, "")}`;
}

/**
 * Where certificate QR codes point (PRD §11.3).
 *
 * Defaults to this deployment's /verify path so a scanned certificate always
 * resolves. Set NEXT_PUBLIC_VERIFICATION_BASE_URL to a dedicated domain when
 * one exists — but only before certificates are issued, since the URL is baked
 * into every PDF and QR code at issuance.
 */
export function verificationBase(): string {
  const explicit = process.env.NEXT_PUBLIC_VERIFICATION_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  return `${appUrl()}/verify`;
}
