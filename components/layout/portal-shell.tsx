import type { ReactNode } from "react";
import type { PortalArea } from "@/components/layout/nav-config";
import { PortalNav } from "@/components/layout/portal-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

/**
 * The frame every portal area sits in.
 *
 * One shell rather than three near-identical layouts, which is how the three
 * dashboards drifted into looking the same while behaving differently — the
 * chrome was copied, so only the copies could be told apart.
 *
 * Ink shell, light canvas: the navigation is dark and continuous with the top
 * bar, and the work happens on a light surface inside it. Dark chrome ties the
 * portal to the landing page; a light canvas is what makes a table of thirty
 * rows readable for an hour.
 *
 * Only the area's name crosses into the client components. The nav config
 * holds real icon components, and a component reference is a function, which
 * React cannot serialise across the server/client boundary.
 */
export function PortalShell({ area, children }: { area: PortalArea; children: ReactNode }) {
  return (
    <div className="flex flex-1">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-brand-ink lg:block">
        {/* Sticky under the top bar, and scrollable on its own so a long nav
            never traps the page. */}
        <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-6 py-7">
          <PortalNav area={area} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-surface-muted">
        {/* Bottom padding clears the mobile bar, which is fixed. */}
        <div className="mx-auto max-w-6xl px-5 pb-28 pt-7 sm:px-8 sm:pt-9 lg:pb-12">{children}</div>
      </main>

      <MobileNav area={area} />
    </div>
  );
}
