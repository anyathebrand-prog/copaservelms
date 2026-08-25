import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Dashboard" };

export default async function StudentDashboard() {
  const user = await requireRole(["STUDENT", "INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/student");

  return (
    <section>
      <h1 className="font-display text-3xl font-bold tracking-tight">Student dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Signed in as {user.email} · roles: {user.roles.join(", ") || "none"}
      </p>
      <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Course list, progress ring, and certificates land here (PRD §9.1).
      </p>
    </section>
  );
}
