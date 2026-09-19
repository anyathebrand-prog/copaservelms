import type { NextConfig } from "next";
import { withFlux } from "@tsworldtech/flux-next/plugin";
import { BYPASS_ROUTES, PRECACHE_ROUTES } from "./config/precache-routes";

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
  // withFlux adds a webpack hook. Next 16 builds with Turbopack and refuses a
  // webpack config it cannot use unless Turbopack is configured explicitly.
  turbopack: {},
};

/**
 * Flux writes public/sw.js from this config every time the config loads —
 * under Turbopack too; its webpack hook only adds cache warming, which
 * Turbopack skips.
 *
 * The worker does nothing until something registers it (FluxProvider or
 * ServiceWorkerRegistrar from @tsworldtech/flux-next). Once registered it
 * caches every page it serves by path alone, so the bypass list is what keeps
 * one person's signed-in pages from being shown to the next person on the
 * same browser. See config/precache-routes.ts.
 */
export default withFlux({
  precacheRoutes: [...PRECACHE_ROUTES],
  offlineShell: "/offline",
  storagePrefix: "copaserve",
  bypassRoutePrefixes: [...BYPASS_ROUTES],
})(nextConfig);
