import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { INSTRUCTOR_NAV } from "@/components/layout/nav-config";

export default function InstructorLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell nav={INSTRUCTOR_NAV} navLabel="Instructor navigation">
      {children}
    </PortalShell>
  );
}
