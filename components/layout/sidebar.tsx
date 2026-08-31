"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Student sidebar (PRD §9.2).
 *
 * Wallet is present but minting is not: linking a wallet works, while minting
 * waits on a deployed contract (§17 question 6).
 */
const NAV = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/search", label: "Search" },
  { href: "/student/courses", label: "My Courses" },
  { href: "/student/certificates", label: "Certificates" },
  { href: "/student/downloads", label: "Downloads" },
  { href: "/student/achievements", label: "Achievements" },
  { href: "/student/assignments", label: "Assignments" },
  { href: "/student/quizzes", label: "Quizzes" },
  { href: "/student/live-classes", label: "Live Classes" },
  { href: "/student/calendar", label: "Calendar" },
  { href: "/student/notifications", label: "Notifications" },
  { href: "/student/wallet", label: "Wallet" },
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
