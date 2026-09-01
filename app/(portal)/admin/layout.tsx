import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/portal-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PortalShell area="admin">{children}</PortalShell>;
}
