"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Student sidebar (PRD §9.2).
 *
 * Live Classes and Wallet are omitted deliberately: they are Phase 2 and
 * Phase 4 respectively (§16), and a nav item that leads nowhere is worse than
 * an absent one.
 */
const NAV = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/courses", label: "My Courses" },
  { href: "/student/certificates", label: "Certificates" },
  { href: "/student/assignments", label: "Assignments" },
  { href: "/student/quizzes", label: "Quizzes" },
  { href: "/student/notifications", label: "Notifications" },
  { href: "/student/payments", label: "Payments" },
  { href: "/student/profile", label: "Profile" },
  { href: "/student/privacy", label: "Privacy" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Student navigation" className="space-y-1">
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
