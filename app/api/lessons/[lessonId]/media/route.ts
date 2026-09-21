import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lessonMediaForViewer } from "@/lib/instructor";
import { signLessonMediaView } from "@/lib/lesson-media";

/**
 * GET /api/lessons/:lessonId/media — a lesson's uploaded file, for someone
 * allowed to see it.
 *
 * The player points here rather than at storage, for two reasons.
 *
 * Access is checked on every load, not once when the page was rendered. A
 * learner who is refunded stops getting the file; nothing baked into an old
 * page keeps working.
 *
 * And no expiring link is ever written into a page. The service worker caches
 * signed-in pages, and a cached lesson page carrying a signed URL from
 * yesterday would load a player that can no longer fetch its own video. This
 * route answers each time with a fresh one instead.
 *
 * Anyone refused gets the same 404, whether the lesson does not exist, has no
 * file, or belongs to a course they are not in.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: NO_STORE });
  }

  const access = await lessonMediaForViewer(lessonId, user.id, user.roles);
  if (!access.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  }

  const url = await signLessonMediaView(access.key);
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
}
