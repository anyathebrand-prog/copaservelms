import { createClient } from "@supabase/supabase-js";

/**
 * Storage abstraction (PRD §6.2).
 *
 * All file writes go through this interface so Supabase Storage can be swapped
 * or mirrored to Cloudflare R2 without touching business logic. Callers deal in
 * keys and bytes; nothing above this layer knows which provider is behind it.
 */

export type StoredObject = {
  key: string;
  /** Public or signed URL, depending on the bucket's visibility. */
  url: string;
};

export interface StorageDriver {
  upload(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** A URL that does not expire. Only meaningful on a public bucket. */
  publicUrl(key: string): string;
}

// `||` not `??`: an env var set to an empty string is a normal way to unset
// one, and ?? would pass "" through as the bucket name, producing an opaque
// "Invalid path specified in request URL" from the storage API.
export const CERTIFICATE_BUCKET = process.env.SUPABASE_CERTIFICATE_BUCKET || "certificates";

/**
 * Course banners, and anything else meant to be seen by anyone.
 *
 * A separate, public bucket on purpose. Certificates live in a private one and
 * are handed out as signed URLs that expire after a week — correct for a
 * document only its owner should read, and quietly wrong for a picture stored
 * in a database column, which would simply stop loading seven days later.
 */
export const COURSE_MEDIA_BUCKET = process.env.SUPABASE_COURSE_MEDIA_BUCKET || "course-media";

/**
 * Supabase Storage driver.
 *
 * Uses the service role key: certificate PDFs are written by the server on
 * issuance, never by the browser, and the bucket is private so the anon key
 * could not write there anyway.
 */
class SupabaseStorageDriver implements StorageDriver {
  private client;

  constructor(
    url: string,
    serviceRoleKey: string,
    private bucket: string,
    /** Public buckets hand back a permanent URL instead of a signed one. */
    private isPublic = false,
  ) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async upload(key: string, body: Uint8Array, contentType: string): Promise<StoredObject> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, body, {
      contentType,
      // Re-issuing a certificate should replace the old file, not accumulate.
      upsert: true,
    });

    if (error) throw new Error(`Storage upload failed for ${key}: ${error.message}`);

    return {
      key,
      url: this.isPublic ? this.publicUrl(key) : await this.signedUrl(key, 60 * 60 * 24 * 7),
    };
  }

  async remove(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`Storage delete failed for ${key}: ${error.message}`);
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds);

    if (error || !data) throw new Error(`Could not sign URL for ${key}: ${error?.message}`);
    return data.signedUrl;
  }

  publicUrl(key: string): string {
    return this.client.storage.from(this.bucket).getPublicUrl(key).data.publicUrl;
  }
}

/**
 * A driver that fails loudly.
 *
 * Returned when storage is unconfigured. Issuance then fails with a message
 * naming the missing variable, rather than silently recording a certificate
 * whose PDF does not exist — a certificate row without its document is worse
 * than no certificate at all.
 */
class UnconfiguredStorageDriver implements StorageDriver {
  private fail(): never {
    throw new Error(
      "Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, " +
        `and create the "${CERTIFICATE_BUCKET}" bucket in Supabase Storage.`,
    );
  }

  async upload(): Promise<StoredObject> {
    this.fail();
  }
  async remove(): Promise<void> {
    this.fail();
  }
  async signedUrl(): Promise<string> {
    this.fail();
  }
  publicUrl(): string {
    this.fail();
  }
}

export function getStorage(bucket = CERTIFICATE_BUCKET): StorageDriver {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return new UnconfiguredStorageDriver();

  return new SupabaseStorageDriver(url, serviceKey, bucket);
}

/** Storage for files the whole web is meant to be able to load. */
export function getPublicStorage(bucket = COURSE_MEDIA_BUCKET): StorageDriver {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return new UnconfiguredStorageDriver();

  return new SupabaseStorageDriver(url, serviceKey, bucket, true);
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
