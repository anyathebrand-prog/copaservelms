import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { ADMIN_NAV } from "@/components/layout/nav-config";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell nav={ADMIN_NAV} navLabel="Admin navigation">
      {children}
    </PortalShell>
  );
}
