"use client";

import type { ReactNode } from "react";
import { FluxProvider, ServiceWorkerRegistrar } from "@tsworldtech/flux-next";
import { flux } from "@/lib/flux";
import { PRECACHE_ROUTES } from "@/config/precache-routes";

/**
 * Switches the Flux service worker on.
 *
 * ServiceWorkerRegistrar is what makes the worker live. From here on it caches
 * pages as they are visited — except the prefixes in BYPASS_ROUTES, which is
 * what keeps signed-in pages, bank details and certificate checks out of a
 * shared browser's cache. That list is in config/precache-routes.ts and must
 * grow with any new page that depends on who is signed in.
 */
export function FluxClientWrapper({ children }: { children: ReactNode }) {
  return (
    <FluxProvider engine={flux} precacheRoutes={PRECACHE_ROUTES}>
      {children}
      <ServiceWorkerRegistrar />
    </FluxProvider>
  );
}
