import { Suspense } from "react";
import { LogoLink } from "@/components/layout/logo";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { NavProgress } from "@/components/layout/nav-progress";
import {
  AreaSwitcherFallback,
  PortalAreaSwitcher,
  PortalUserEmail,
  UserEmailFallback,
} from "@/components/layout/portal-identity";

/**
 * The portal frame: an ink top bar over whichever area shell the route sits in.
 *
 * The bar is dark and continuous with the sidebar beneath it, so the chrome
 * reads as one L-shaped frame around a light working canvas rather than as two
 * separate strips.
 *
 * Nothing is awaited here on purpose. A layout that awaits runtime data makes
 * every navigation wait on that data before anything can render, and the Next
 * docs are explicit that it also stops loading.tsx showing a fallback for it.
 * The two pieces that need the session are behind their own Suspense
 * boundaries below, so the shell paints without waiting for a session lookup.
 *
 * On its own this did not make the loading state appear — measured, not
 * assumed. That has a separate cause and NavProgress is what addresses it.
 */
export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <NavProgress />

      <header className="sticky top-0 z-40 h-16 border-b border-white/10 bg-brand-ink/95 text-white backdrop-blur">
        <div className="mx-auto flex h-full items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <LogoLink height={26} variant="white" />
            <Suspense fallback={<AreaSwitcherFallback />}>
              <PortalAreaSwitcher />
            </Suspense>
          </div>

          <div className="flex items-center gap-3">
            <Suspense fallback={<UserEmailFallback />}>
              <PortalUserEmail />
            </Suspense>
            <SignOutButton />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
