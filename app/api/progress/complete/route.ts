import { getCurrentUser } from "@/lib/auth";
import { markLessonComplete } from "@/lib/student";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/progress/complete — mark a lesson finished.
 *
 * The same work as the server action behind the button, reachable as plain
 * HTTP so an offline queue can replay it later. A queued write is replayed by
 * a library, not by a form submission, and a Server Action's RSC-encoded
 * argument stream is not something a queue can reasonably reproduce.
 *
 * Replay-safe because markLessonComplete is: the progress row is an upsert and
 * experience points are awarded only on the first completion, so the same entry
 * arriving twice — which a queue will do if the network drops mid-reply —
 * changes nothing the second time.
 *
 * The caller comes from the session cookie, never the body. A queued entry
 * carries a lesson id and nothing else; whose progress it advances is decided
 * here, so an entry replayed from a shared device cannot land on the wrong
 * account.
 */
export const dynamic = "force-dynamic";

const LIMIT = 60;
const WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to record progress." }, { status: 401 });
  }

  // A queue flushing after a long time offline can arrive in a burst, so this
  // is generous: it is here to stop a runaway loop, not to pace a learner.
  const limit = rateLimit(`progress:${user.id}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many at once." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }

  const { lessonId, userId } = (body ?? {}) as { lessonId?: unknown; userId?: unknown };
  if (typeof lessonId !== "string" || !lessonId.trim()) {
    return Response.json({ error: "Send { lessonId }." }, { status: 400 });
  }

  // The entry says whose progress it is; the session says who is asking. On a
  // shared phone those differ — a lesson queued by one learner replaying after
  // another has signed in. Flux can scope replay by user, but only on a paid
  // tier with multi-tenant isolation, and a licence that fails to verify drops
  // to the free tier silently. So this is enforced here, where it cannot be
  // switched off by a network hiccup at a vendor.
  //
  // 403 rather than silently ignoring: a 4xx is permanent to the queue, so the
  // stray entry is discarded instead of retried for ever. The other learner's
  // completion is lost, which is the right failure — the alternative is
  // crediting it to the wrong person, on a platform that issues certificates.
  if (userId !== undefined && userId !== user.id) {
    return Response.json({ error: "WRONG_ACCOUNT" }, { status: 403 });
  }

  const result = await markLessonComplete(user.id, lessonId.trim());

  if (!result.ok) {
    // NOT_ENROLLED and NOT_FOUND are permanent: replaying them forever would
    // keep a dead entry in the queue, so they are 4xx rather than 5xx and the
    // queue drops them.
    return Response.json({ error: result.error }, { status: 404 });
  }

  return Response.json({
    ok: true,
    finished: result.finished,
    nextQuizId: result.nextQuizId ?? null,
    certificate: result.certificate ?? null,
  });
}
