import type { Metadata } from "next";
import { requireRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Instructor" };

export default async function InstructorDashboard() {
  const user = await requireRole(["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/instructor");

  return (
    <section>
      <h1 className="font-display text-3xl font-bold tracking-tight">Instructor dashboard</h1>
      <p className="mt-2 text-muted-foreground">Signed in as {user.email}</p>
      <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Course builder and student management land here (PRD §10).
      </p>
    </section>
  );
}
