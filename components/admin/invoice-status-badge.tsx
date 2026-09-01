import type { InvoiceStatus } from "@/app/generated/prisma/enums";

/**
 * An invoice's state, at a glance.
 *
 * Overdue is not a status in the database — it is issued plus a date that has
 * passed — but it is the distinction someone scanning this list actually cares
 * about, so it is drawn as though it were one.
 */
const STYLES: Record<InvoiceStatus, string> = {
  DRAFT: "bg-surface-muted text-muted-foreground",
  ISSUED: "bg-brand-pale text-brand",
  PAID: "bg-success/10 text-success",
  CANCELLED: "bg-muted-foreground/10 text-muted-foreground line-through",
};

export function InvoiceStatusBadge({
  status,
  overdue = false,
}: {
  status: InvoiceStatus;
  overdue?: boolean;
}) {
  const label = overdue && status === "ISSUED" ? "overdue" : status.toLowerCase();
  const style = overdue && status === "ISSUED" ? "bg-warning/10 text-warning" : STYLES[status];

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}
