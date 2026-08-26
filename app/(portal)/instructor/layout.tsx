import type { ReactNode } from "react";
import { InstructorSidebar } from "@/components/layout/instructor-sidebar";

export default function InstructorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-6 py-8">
      <aside className="hidden w-56 shrink-0 sm:block">
        <InstructorSidebar />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
