import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { STUDENT_NAV } from "@/components/layout/nav-config";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell nav={STUDENT_NAV} navLabel="Student navigation">
      {children}
    </PortalShell>
  );
}
