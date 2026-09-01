"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { createInvoiceAction } from "@/app/(portal)/admin/invoices/actions";

/**
 * Raise a draft invoice.
 *
 * A client component for one reason: an invoice has a variable number of lines,
 * and a running total that is wrong until the page reloads is worse than no
 * total at all — someone would quote it to a customer.
 *
 * Prices are entered in naira and converted to kobo in the server action. The
 * running total here is presentational; the figures that reach the database are
 * recomputed server-side from the lines, so a tampered field cannot change what
 * is billed.
 */
type Line = { key: number; description: string; courseId: string; quantity: string; unitAmount: string };

let nextKey = 1;
const blankLine = (): Line => ({
  key: nextKey++,
  description: "",
  courseId: "",
  quantity: "1",
  unitAmount: "",
});

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function InvoiceForm({
  organizations,
  courses,
}: {
  organizations: { id: string; name: string }[];
  courses: { id: string; title: string; priceMinor: number }[];
}) {
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [discount, setDiscount] = useState("");

  function update(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  /** Choosing a course fills the description and its list price, both editable. */
  function chooseCourse(key: number, courseId: string) {
    const course = courses.find((c) => c.id === courseId);
    update(key, {
      courseId,
      ...(course
        ? { description: course.title, unitAmount: (course.priceMinor / 100).toFixed(2) }
        : {}),
    });
  }

  const subtotal = lines.reduce(
    (sum, line) =>
      sum + (Number.parseInt(line.quantity, 10) || 0) * (Number.parseFloat(line.unitAmount) || 0),
    0,
  );
  const discountValue = Number.parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountValue);

  return (
    <form action={createInvoiceAction} className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-display text-lg font-semibold">New invoice</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Saved as a draft. Nothing gets an invoice number until you issue it, so an abandoned draft
        leaves no gap in the sequence.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Customer</span>
          <select
            name="organizationId"
            required
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Due <span className="font-normal text-muted-foreground">(blank means on receipt)</span>
          </span>
          <input
            type="date"
            name="dueAt"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          />
        </label>
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium">Lines</p>

        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <div className="space-y-2">
              <select
                value={line.courseId}
                onChange={(event) => chooseCourse(line.key, event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground outline-none transition focus:border-brand"
              >
                <option value="">Not a course on the platform</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <input type="hidden" name="lineCourseId" value={line.courseId} />
              <input
                name="description"
                required={index === 0}
                value={line.description}
                onChange={(event) => update(line.key, { description: event.target.value })}
                placeholder="What is being billed"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
              />
            </div>

            <input
              name="quantity"
              type="number"
              min={1}
              value={line.quantity}
              onChange={(event) => update(line.key, { quantity: event.target.value })}
              aria-label="Quantity"
              className="w-20 self-end rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />

            <input
              name="unitAmount"
              type="number"
              min={0}
              step="0.01"
              value={line.unitAmount}
              onChange={(event) => update(line.key, { unitAmount: event.target.value })}
              aria-label="Unit price in naira"
              placeholder="0.00"
              className="w-32 self-end rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />

            <button
              type="button"
              onClick={() => setLines((c) => (c.length > 1 ? c.filter((l) => l.key !== line.key) : c))}
              disabled={lines.length === 1}
              aria-label="Remove line"
              className="self-end rounded-lg border border-border p-2.5 text-muted-foreground transition hover:bg-surface-muted disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setLines((current) => [...current, blankLine()])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-surface-muted"
        >
          <Plus className="size-4" />
          Add line
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Discount (naira)</span>
          <input
            name="discount"
            type="number"
            min={0}
            step="0.01"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          />
        </label>

        <div className="self-end rounded-xl bg-surface-muted p-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{naira.format(subtotal)}</span>
          </div>
          {discountValue > 0 && (
            <div className="mt-1 flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{naira.format(discountValue)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-display text-base font-bold">
            <span>Total</span>
            <span className="text-brand">{naira.format(total)}</span>
          </div>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium">Notes</span>
        <textarea
          name="notes"
          rows={2}
          placeholder="Purchase order number, contract reference, anything the customer needs to see."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
        />
      </label>

      <div className="mt-5">
        <SubmitButton
          pendingLabel="Creating..."
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Create draft
        </SubmitButton>
      </div>
    </form>
  );
}
