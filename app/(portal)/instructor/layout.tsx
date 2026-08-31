import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/portal-shell";

export default function InstructorLayout({ children }: { children: ReactNode }) {
  return <PortalShell area="instructor">{children}</PortalShell>;
}
