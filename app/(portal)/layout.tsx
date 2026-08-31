import { AreaSwitcher } from "@/components/layout/area-switcher";
import { LogoLink } from "@/components/layout/logo";
import { requireUser } from "@/lib/roles";
import { SignOutButton } from "@/components/layout/sign-out-button";

/**
 * The portal frame: an ink top bar over whichever area shell the route sits in.
 *
 * The bar is dark and continuous with the sidebar beneath it, so the chrome
 * reads as one L-shaped frame around a light working canvas rather than as two
 * separate strips.
 */
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  // Email rather than a display name: the name lives on Profile, and fetching
  // it here would add a query to every page in the portal for one label.
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <header className="sticky top-0 z-40 h-16 border-b border-white/10 bg-brand-ink/95 text-white backdrop-blur">
        <div className="mx-auto flex h-full items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <LogoLink height={26} variant="white" />
            <AreaSwitcher roles={user.roles} />
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-white/50 sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
