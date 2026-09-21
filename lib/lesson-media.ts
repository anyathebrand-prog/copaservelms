import { randomUUID } from "node:crypto";
import { LESSON_MEDIA_BUCKET, getStorage, isStorageConfigured } from "@/lib/storage";
import type { LessonType } from "@/app/generated/prisma/enums";

/**
 * Lesson files — the videos, PDFs and audio a course is made of.
 *
 * Uploaded by instructors, straight from the browser to a private bucket, and
 * never given a permanent URL. Two decisions shape everything here.
 *
 * The browser uploads directly to storage. A lesson video is routinely larger
 * than a server action will accept, and streaming it through a function would
 * pay for the bytes twice. So the server only signs: it checks who is asking,
 * picks the key, and hands back a one-shot URL good for that key alone. When
 * the browser reports the upload done, the server looks at what actually
 * arrived before attaching it — the browser's word is not evidence.
 *
 * The database stores a reference, not a URL: `storage://lesson-media/<key>`.
 * A signed URL would expire in the column; a public one would give the course
 * away. The reference is resolved at the moment of viewing, by a route that
 * checks enrolment first (app/api/lessons/[lessonId]/media).
 *
 * Ownership is not checked here. It is checked in lib/instructor.ts, which
 * stays the single gate for anything that changes a course; this module only
 * knows about files.
 */

const REF_PREFIX = `storage://${LESSON_MEDIA_BUCKET}/`;

/** What a file is, keyed by the type the browser declared and storage recorded. */
const ACCEPTED: Record<string, { ext: string; lessonType: LessonType }> = {
  "application/pdf": { ext: "pdf", lessonType: "PDF" },
  "video/mp4": { ext: "mp4", lessonType: "VIDEO" },
  "video/webm": { ext: "webm", lessonType: "VIDEO" },
  "video/quicktime": { ext: "mov", lessonType: "VIDEO" },
  "audio/mpeg": { ext: "mp3", lessonType: "AUDIO" },
  "audio/mp4": { ext: "m4a", lessonType: "AUDIO" },
  "audio/x-m4a": { ext: "m4a", lessonType: "AUDIO" },
  "audio/aac": { ext: "aac", lessonType: "AUDIO" },
  "audio/wav": { ext: "wav", lessonType: "AUDIO" },
  "audio/x-wav": { ext: "wav", lessonType: "AUDIO" },
  "audio/webm": { ext: "weba", lessonType: "AUDIO" },
  "audio/ogg": { ext: "ogg", lessonType: "AUDIO" },
};

/** For the file picker. Extensions too, because Windows often reports no type. */
export const LESSON_MEDIA_ACCEPT = [
  ...Object.keys(ACCEPTED),
  ".pdf,.mp4,.webm,.mov,.mp3,.m4a,.aac,.wav,.weba,.ogg",
].join(",");

/**
 * The plan's ceiling, used when the bucket has none of its own.
 *
 * Supabase's free plan refuses any single file over 50MB, whatever the bucket
 * says. The bucket's own limit is read first, so moving to a paid plan and
 * raising that limit in the dashboard is the whole of the upgrade — nothing
 * here needs to change.
 */
const FALLBACK_MAX_BYTES = 50 * 1024 * 1024;

let cachedLimit: { bytes: number; at: number } | null = null;

/** The largest file a lesson can take, in bytes. Cached for five minutes. */
export async function lessonMediaMaxBytes(): Promise<number> {
  if (cachedLimit && Date.now() - cachedLimit.at < 5 * 60_000) return cachedLimit.bytes;
  let bytes = FALLBACK_MAX_BYTES;
  if (isStorageConfigured()) {
    try {
      bytes = (await getStorage(LESSON_MEDIA_BUCKET).maxFileBytes()) ?? FALLBACK_MAX_BYTES;
    } catch {
      // Falling back is safe: storage enforces its own limit regardless, so a
      // wrong number here costs a clearer message, never a bigger file.
    }
  }
  cachedLimit = { bytes, at: Date.now() };
  return bytes;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function isStoredLessonMedia(contentUrl: string | null | undefined): contentUrl is string {
  return typeof contentUrl === "string" && contentUrl.startsWith(REF_PREFIX);
}

export function lessonMediaKey(ref: string): string | null {
  return isStoredLessonMedia(ref) ? ref.slice(REF_PREFIX.length) : null;
}

function refFor(key: string): string {
  return REF_PREFIX + key;
}

function lessonPrefix(courseId: string, lessonId: string): string {
  return `courses/${courseId}/lessons/${lessonId}/`;
}

/**
 * Whether a stored file belongs to this lesson of this course.
 *
 * Checked on attach and again on every view. Without it, an instructor who
 * typed another course's reference into a lesson would have their own
 * students handed signed links to someone else's paid content.
 */
export function keyBelongsTo(key: string, courseId: string, lessonId: string): boolean {
  return key.startsWith(lessonPrefix(courseId, lessonId)) && !key.includes("..");
}

/** The name an instructor recognises: "ndpa-module-1.pdf", not a uuid. */
export function storedFileName(ref: string): string {
  const key = lessonMediaKey(ref) ?? "";
  const last = key.slice(key.lastIndexOf("/") + 1);
  // Keys are "<uuid>-<name>.<ext>"; the uuid is 36 characters and a dash.
  return last.length > 37 ? last.slice(37) : last;
}

/**
 * The readable part of a key, from the uploaded file's name.
 *
 * Reduced to lowercase letters, digits and dashes before it goes anywhere near
 * a path, so it cannot traverse, collide or smuggle anything — the uuid in
 * front is what actually makes the key unique; this is only for recognition.
 */
function readableSlug(fileName: string): string {
  const stem = fileName.replace(/\.[^.]*$/, "");
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "file";
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export type UploadRefusal = "UNSUPPORTED_TYPE" | "TOO_LARGE" | "EMPTY" | "UNCONFIGURED";

/**
 * Decide where an upload goes, and sign a URL for exactly that key.
 *
 * Nothing is written to the lesson yet. The signed URL is only permission to
 * put one file at one key; the lesson changes when the upload is attached.
 */
export async function signLessonUpload(input: {
  courseId: string;
  lessonId: string;
  fileName: string;
  contentType: string;
  size: number;
}): Promise<
  | { ok: true; key: string; url: string; token: string; lessonType: LessonType }
  | { ok: false; error: UploadRefusal; maxBytes?: number }
> {
  if (!isStorageConfigured()) return { ok: false, error: "UNCONFIGURED" };

  const accepted = ACCEPTED[input.contentType];
  if (!accepted) return { ok: false, error: "UNSUPPORTED_TYPE" };
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: "EMPTY" };

  const maxBytes = await lessonMediaMaxBytes();
  if (input.size > maxBytes) return { ok: false, error: "TOO_LARGE", maxBytes };

  const key =
    lessonPrefix(input.courseId, input.lessonId) +
    `${randomUUID()}-${readableSlug(input.fileName)}.${accepted.ext}`;

  const signed = await getStorage(LESSON_MEDIA_BUCKET).signedUploadUrl(key);
  return { ok: true, key, url: signed.url, token: signed.token, lessonType: accepted.lessonType };
}

/**
 * Look at what actually arrived at a key.
 *
 * The browser declared a type and a size to get the signed URL; this is where
 * that declaration stops mattering. A file storage recorded as something other
 * than an accepted type is deleted rather than attached.
 */
export async function inspectLessonUpload(
  key: string,
): Promise<{ ok: true; ref: string; lessonType: LessonType } | { ok: false; error: "MISSING" | "UNSUPPORTED_TYPE" }> {
  const storage = getStorage(LESSON_MEDIA_BUCKET);
  const stat = await storage.stat(key);
  if (!stat || stat.size <= 0) return { ok: false, error: "MISSING" };

  const accepted = ACCEPTED[stat.contentType.split(";")[0].trim()];
  if (!accepted) {
    await storage.remove(key).catch(() => {});
    return { ok: false, error: "UNSUPPORTED_TYPE" };
  }

  return { ok: true, ref: refFor(key), lessonType: accepted.lessonType };
}

/**
 * Delete a lesson's stored file, if it has one. Best effort.
 *
 * Called after the database change has committed, never before: a file left
 * behind costs a little storage, while a lesson pointing at a deleted file is
 * a broken course. Failures are logged, not thrown, for the same reason.
 */
export async function discardLessonMedia(contentUrl: string | null | undefined): Promise<void> {
  const key = isStoredLessonMedia(contentUrl) ? lessonMediaKey(contentUrl) : null;
  if (!key || !isStorageConfigured()) return;
  try {
    await getStorage(LESSON_MEDIA_BUCKET).remove(key);
  } catch (cause) {
    console.error("[lesson-media] could not delete", key, cause);
  }
}

// ---------------------------------------------------------------------------
// Viewing
// ---------------------------------------------------------------------------

/**
 * How long a signed viewing URL lasts.
 *
 * A video player keeps requesting byte ranges for as long as someone is
 * watching, and a URL that expires mid-lesson stalls the player at whatever
 * point it had buffered to. Four hours covers any sitting; the link only ever
 * reaches someone who was checked for enrolment a moment before.
 */
const VIEW_TTL_SECONDS = 4 * 60 * 60;

/** A short-lived URL for one stored file. Only call after checking access. */
export async function signLessonMediaView(key: string): Promise<string> {
  return getStorage(LESSON_MEDIA_BUCKET).signedUrl(key, VIEW_TTL_SECONDS);
}

/** Where the player should point for a lesson's content. */
export function lessonMediaSrc(lessonId: string, contentUrl: string | null): string | null {
  if (!contentUrl) return null;
  // Stored files go through the access-checking route; a pasted link is the
  // instructor's own and is used as given.
  return isStoredLessonMedia(contentUrl) ? `/api/lessons/${lessonId}/media` : contentUrl;
}
