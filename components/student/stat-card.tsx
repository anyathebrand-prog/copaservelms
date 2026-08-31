import type { LucideIcon } from "lucide-react";

/**
 * A single number, on the light canvas.
 *
 * Deliberately quiet. These appear four and six and eight at a time, and when
 * every one of them is a bordered box with a bold number, none of them is
 * read — the eye needs somewhere to land first. So the tile is flat and the
 * emphasis lives on whatever sits above it (see HeroMetric).
 *
 * `tone="alert"` is for a count that means someone has to do something, which
 * is a different kind of fact from a total.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "alert";
}) {
  const alert = tone === "alert" && value !== 0 && value !== "0";

  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        alert ? "border-warning/30 bg-warning/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon className={`size-4 ${alert ? "text-warning" : "text-muted-foreground/70"}`} />
        )}
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p
        className={`mt-2 font-display text-3xl font-bold tracking-tight ${
          alert ? "text-warning" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
