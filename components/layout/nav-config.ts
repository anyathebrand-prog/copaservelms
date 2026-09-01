import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ClipboardCheck,
  CreditCard,
  Download,
  Eye,
  FileText,
  KeyRound,
  LayoutDashboard,
  MailPlus,
  PenSquare,
  ReceiptText,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  Trophy,
  User,
  Users,
  UsersRound,
  Video,
  Wallet,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Portal navigation.
 *
 * Grouped rather than listed. Fifteen flat links is not navigation — nobody
 * scans a list that long, they hunt it, and hunting is the thing navigation
 * exists to prevent. The groups are the questions a person actually arrives
 * with: what am I learning, what have I earned, what do I owe, who am I.
 *
 * `primary` marks the handful that appear in the mobile bottom bar. Everything
 * else is still reachable there, behind More.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
};

export type NavGroup = {
  /** Omitted for the first group, which needs no label above the fold. */
  label?: string;
  items: NavItem[];
};

/** Student navigation (PRD §9.2). Wallet links, minting waits on §17 q6. */
export const STUDENT_NAV: NavGroup[] = [
  {
    items: [
      { href: "/student", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/student/search", label: "Search", icon: Search },
    ],
  },
  {
    label: "Learning",
    items: [
      { href: "/student/courses", label: "My Courses", icon: BookOpen, primary: true },
      { href: "/student/quizzes", label: "Quizzes", icon: ClipboardCheck },
      { href: "/student/assignments", label: "Assignments", icon: FileText, primary: true },
      { href: "/student/live-classes", label: "Live Classes", icon: Video },
      { href: "/student/calendar", label: "Calendar", icon: Calendar },
    ],
  },
  {
    label: "Achievements",
    items: [
      { href: "/student/certificates", label: "Certificates", icon: Award, primary: true },
      { href: "/student/achievements", label: "Badges", icon: Trophy },
      { href: "/student/downloads", label: "Downloads", icon: Download },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/student/notifications", label: "Notifications", icon: Bell },
      { href: "/student/wallet", label: "Wallet", icon: Wallet },
      { href: "/student/payments", label: "Payments", icon: CreditCard },
      { href: "/student/profile", label: "Profile", icon: User },
      { href: "/student/privacy", label: "Privacy", icon: ShieldCheck },
    ],
  },
];

/** Instructor navigation (PRD §10.2). */
export const INSTRUCTOR_NAV: NavGroup[] = [
  {
    items: [
      { href: "/instructor", label: "Courses", icon: BookOpen, primary: true },
      { href: "/instructor/grading", label: "Grading", icon: PenSquare, primary: true },
    ],
  },
  {
    label: "Elsewhere",
    items: [{ href: "/student", label: "Student view", icon: Eye, primary: true }],
  },
];

/** Admin navigation (PRD §13.2). */
export const ADMIN_NAV: NavGroup[] = [
  {
    items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, primary: true }],
  },
  {
    label: "People & learning",
    items: [
      { href: "/admin/courses", label: "Courses", icon: BookOpen, primary: true },
      { href: "/admin/users", label: "Users", icon: Users, primary: true },
      { href: "/admin/organizations", label: "Organisations", icon: Building2 },
      { href: "/admin/cohorts", label: "Cohorts", icon: UsersRound },
      { href: "/admin/waitlist", label: "Waitlist", icon: MailPlus },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/payments", label: "Payments", icon: CreditCard, primary: true },
      { href: "/admin/coupons", label: "Coupons", icon: Ticket },
      { href: "/admin/invoices", label: "Invoices", icon: ReceiptText },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "/admin/certificates", label: "Certificates", icon: Award },
      { href: "/admin/privacy", label: "Compliance", icon: ShieldCheck },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/api-keys", label: "API keys", icon: KeyRound },
      { href: "/admin/webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
];

/**
 * Whether a nav item matches the current path.
 *
 * Exact match for area roots, prefix match otherwise: /admin would otherwise
 * light up on every admin page, and /student on every student page.
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/admin" || href === "/instructor" || href === "/student") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Areas, addressed by name.
 *
 * The config holds real icon components, which cannot cross the server/client
 * boundary as props — React can only send serialisable values, and a component
 * reference is a function. So the shell names an area and the client
 * navigation looks it up here, keeping one source of truth without shipping
 * the config through props.
 */
export type PortalArea = "student" | "instructor" | "admin";

export const NAV_BY_AREA: Record<PortalArea, { groups: NavGroup[]; label: string }> = {
  student: { groups: STUDENT_NAV, label: "Student navigation" },
  instructor: { groups: INSTRUCTOR_NAV, label: "Instructor navigation" },
  admin: { groups: ADMIN_NAV, label: "Admin navigation" },
};
