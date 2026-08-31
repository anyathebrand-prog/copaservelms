"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Admin navigation, limited to the modules Phase 1 ships (PRD §13.2). */
const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/organizations", label: "Organisations" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/certificates", label: "Certificates" },
  { href: "/admin/privacy", label: "Compliance" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/api-keys", label: "API keys" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin navigation" className="space-y-1">
      {NAV.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
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
