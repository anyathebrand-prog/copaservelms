import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminDashboard() {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin");

  return (
    <section>
      <h1 className="font-display text-3xl font-bold tracking-tight">Admin dashboard</h1>
      <p className="mt-2 text-muted-foreground">Signed in as {user.email}</p>
      <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Approvals and user management land here (PRD §13).
      </p>
    </section>
  );
}
