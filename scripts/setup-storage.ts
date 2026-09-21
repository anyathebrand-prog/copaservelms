/**
 * Create the storage buckets the app expects.
 *
 * Idempotent, and explicit about visibility: certificates are private because
 * they are handed out as expiring signed URLs, course media is public because
 * its URL is stored in a database column and has to keep working.
 *
 *   npx tsx --env-file=.env scripts/setup-storage.ts
 */
import { createClient } from "@supabase/supabase-js";
import { CERTIFICATE_BUCKET, COURSE_MEDIA_BUCKET, LESSON_MEDIA_BUCKET } from "../lib/storage";

const BUCKETS = [
  {
    name: LESSON_MEDIA_BUCKET,
    // Private: this is the paid content itself. Viewed only through signed
    // URLs handed out after an enrolment check.
    public: false,
    // Supabase's free plan refuses any file over 50MB whatever this says. On a
    // paid plan, raise it here and in the dashboard — the app reads the
    // bucket's limit, so nothing else changes.
    limit: 50 * 1024 * 1024,
    types: [
      "application/pdf",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
    ],
  },
  { name: CERTIFICATE_BUCKET, public: false, limit: 10 * 1024 * 1024, types: ["application/pdf"] },
  {
    name: COURSE_MEDIA_BUCKET,
    public: true,
    limit: 8 * 1024 * 1024,
    // Only what the uploader re-encodes to. A bucket policy is a second lock
    // on the same door, which is the point.
    types: ["image/webp"],
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error } = await supabase.storage.listBuckets();
  if (error) throw new Error("Could not list buckets: " + error.message);

  const have = new Map((existing ?? []).map((b) => [b.name, b]));

  for (const bucket of BUCKETS) {
    const options = {
      public: bucket.public,
      fileSizeLimit: bucket.limit,
      allowedMimeTypes: bucket.types,
    };

    if (!have.has(bucket.name)) {
      const { error: failed } = await supabase.storage.createBucket(bucket.name, options);
      console.log(
        (failed ? "FAILED  " : "CREATED  ") + bucket.name +
          (bucket.public ? "  (public)" : "  (private)") + (failed ? " — " + failed.message : ""),
      );
      continue;
    }

    const current = have.get(bucket.name)!;
    if (current.public !== bucket.public) {
      const { error: failed } = await supabase.storage.updateBucket(bucket.name, options);
      console.log(
        (failed ? "FAILED  " : "FIXED  ") + bucket.name +
          ` — visibility was ${current.public ? "public" : "private"}, should be ${bucket.public ? "public" : "private"}` +
          (failed ? ": " + failed.message : ""),
      );
    } else {
      console.log("OK  " + bucket.name + (bucket.public ? "  (public)" : "  (private)"));
    }
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
