const STYLES: Record<string, string> = {
  DRAFT: "bg-surface-muted text-muted-foreground",
  SUBMITTED: "bg-warning/10 text-warning",
  APPROVED: "bg-brand-pale text-brand",
  PUBLISHED: "bg-success/10 text-success",
  ARCHIVED: "bg-border text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? STYLES.DRAFT}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
