import { createFlux, createNoopAdapter } from "@tsworldtech/flux";

/**
 * The Flux engine, one per page.
 *
 * FluxProvider needs it during server rendering too, because the provider is a
 * client component and client components render on the server first. That is
 * safe: checked with the licence loaded, createFlux on the server starts no
 * timers and makes no network calls — the licence check only runs in a
 * browser.
 *
 * No realtime adapter. Nothing here syncs data through Flux yet; it is running
 * the service worker and its offline pages. A Supabase adapter would put the
 * browser in direct conversation with Postgres, which is a separate decision.
 */
export const flux = createFlux({
  adapter: createNoopAdapter(),
  license: process.env.NEXT_PUBLIC_FLUX_LICENSE_TOKEN,
  // Must match storagePrefix in next.config.ts, which names the worker's store.
  storagePrefix: "copaserve",
  onStorageFallback: (layer, reason) => {
    console.warn(`[flux] storage fell back to ${layer}: ${reason}`);
  },
});
