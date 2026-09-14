import type { NextConfig } from "next";

/**
 * next/image refuses any remote host that is not listed here, so an uploaded
 * banner would render as a broken image with a server-side error and nothing
 * on the page to explain it. The hostname comes from the Supabase URL rather
 * than being hard-coded, so a project change does not silently break images.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  experimental: {
    serverActions: {
      // Server Actions cap request bodies at 1MB by default, which silently
      // breaks assignment uploads (PRD §9.6 accepts video). Matches the 25MB
      // per-file limit enforced in lib/assignments.ts and on the bucket, with
      // headroom for multipart overhead and multiple files in one submission.
      bodySizeLimit: "60mb",
    },
  },
};

export default nextConfig;
