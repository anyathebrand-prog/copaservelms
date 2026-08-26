import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
