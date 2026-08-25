import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-6 py-8">
      {/* Collapses to a horizontal scroller on mobile; bottom nav is a later refinement. */}
      <aside className="hidden w-56 shrink-0 sm:block">
        <Sidebar />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
