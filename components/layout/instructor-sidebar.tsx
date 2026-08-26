"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Instructor navigation (PRD §10.2), limited to what Phase 1 ships. */
const NAV = [
  { href: "/instructor", label: "Courses" },
  { href: "/instructor/grading", label: "Grading" },
  { href: "/student", label: "Student view" },
];

export function InstructorSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Instructor navigation" className="space-y-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`block rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-brand-pale font-semibold text-brand"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
