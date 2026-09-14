import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { COURSE_MEDIA_BUCKET, getPublicStorage, isStorageConfigured } from "@/lib/storage";

/**
 * Course banners.
 *
 * The first place on this platform where a file arrives from a browser rather
 * than being written by the server, so it is the first place that has to treat
 * an upload as hostile until proven otherwise.
 *
 * Three things do that work:
 *
 * Re-encoding. The bytes are decoded and written out again as WebP rather than
 * stored as received. A file that is not really an image fails to decode and
 * is rejected; a file that is both a valid image and something else — the
 * polyglot trick — loses the something else. It also strips EXIF, which on a
 * photo taken with a phone carries GPS coordinates the uploader did not think
 * they were publishing.
 *
 * A server-chosen key. The stored path is derived from the course id and a
 * random name, never from the uploaded filename, so no upload can traverse a
 * path or overwrite another course's banner.
 *
 * An ownership check before anything is written, because a server action is a
 * public endpoint and the course id arrives in the form.
 */

export type MediaError = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "UNCONFIGURED";
export type Result<T> = { ok: true; data: T } | { ok: false; error: MediaError; detail?: string };

/** Four megabytes. Generous for a banner, small enough that a bad one fails fast. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Wide, because it is rendered as a card cover and a page header. */
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

/** The same list, for the file picker. */
export const BANNER_ACCEPT = ACCEPTED.join(",");
export const BANNER_MAX_MB = MAX_BYTES / 1024 / 1024;

async function canEdit(courseId: string, userId: string, roles: string[]) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, instructorId: true, thumbnailUrl: true },
  });

  if (!course) return { ok: false as const, error: "NOT_FOUND" as const };
  if (course.instructorId !== userId && !isAdmin(roles)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  return { ok: true as const, course };
}

export async function setCourseBanner(
  courseId: string,
  file: File,
  userId: string,
  roles: string[],
): Promise<Result<{ thumbnailUrl: string }>> {
  const allowed = await canEdit(courseId, userId, roles);
  if (!allowed.ok) return allowed;

  if (!isStorageConfigured()) {
    return {
      ok: false,
      error: "UNCONFIGURED",
      detail: `Storage is not configured. Create the "${COURSE_MEDIA_BUCKET}" bucket and set SUPABASE_SERVICE_ROLE_KEY.`,
    };
  }

  if (file.size === 0) return { ok: false, error: "INVALID", detail: "That file is empty." };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "INVALID", detail: `Keep the image under ${BANNER_MAX_MB}MB.` };
  }

  // The browser's content type is a hint, not evidence — the decode below is
  // what actually decides whether this is an image.
  if (file.type && !ACCEPTED.includes(file.type)) {
    return { ok: false, error: "INVALID", detail: "Use a JPEG, PNG, WebP, AVIF or GIF." };
  }

  const input = new Uint8Array(await file.arrayBuffer());

  let body: Buffer;
  try {
    body = await sharp(input, { animated: false })
      .rotate() // Apply the EXIF orientation before that metadata is discarded.
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: "INVALID", detail: "That file is not an image we can read." };
  }

  // Random, so replacing a banner never serves a stale cached copy at the same
  // URL, and so nothing about the uploader's filename reaches the bucket.
  const key = `courses/${courseId}/${crypto.randomUUID()}.webp`;
  const stored = await getPublicStorage().upload(key, body, "image/webp");

  const previous = allowed.course.thumbnailUrl;

  await prisma.course.update({
    where: { id: courseId },
    data: { thumbnailUrl: stored.url },
  });

  // Only after the row points at the new one. The reverse order would leave a
  // course pointing at a file that has just been deleted.
  await removeStoredBanner(previous);

  return { ok: true, data: { thumbnailUrl: stored.url } };
}

export async function clearCourseBanner(
  courseId: string,
  userId: string,
  roles: string[],
): Promise<Result<null>> {
  const allowed = await canEdit(courseId, userId, roles);
  if (!allowed.ok) return allowed;

  await prisma.course.update({ where: { id: courseId }, data: { thumbnailUrl: null } });
  await removeStoredBanner(allowed.course.thumbnailUrl);

  return { ok: true, data: null };
}

/**
 * Delete the object a stored URL points at, if we are the ones hosting it.
 *
 * Failure is swallowed: an orphaned file costs a few kilobytes, while a throw
 * here would fail an upload that has already succeeded.
 */
async function removeStoredBanner(url: string | null): Promise<void> {
  if (!url) return;

  const marker = `/${COURSE_MEDIA_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return;

  const key = url.slice(at + marker.length).split("?")[0]!;
  if (!key.startsWith("courses/")) return;

  await getPublicStorage()
    .remove(decodeURIComponent(key))
    .catch((cause) => console.error("[course-media] could not remove", key, cause));
}
