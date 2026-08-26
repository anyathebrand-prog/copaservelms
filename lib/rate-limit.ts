/**
 * Minimal fixed-window rate limiter (PRD §12.4).
 *
 * In-process and per-instance: it blunts casual scraping of the public
 * verification endpoint, but it is NOT a distributed limit — a multi-instance
 * deployment gets N times the ceiling, and it resets on redeploy. Move this to
 * Redis or the edge before relying on it as a real control.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic sweep so the map cannot grow without bound.
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }
    return { ok: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client address from proxy headers. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
