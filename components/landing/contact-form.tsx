"use client";

import { useActionState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { submitEnquiryAction, type ContactState } from "@/app/contact/actions";

/**
 * The corporate enquiry form.
 *
 * Name, email and message are required; everything else earns its place by
 * being the thing that would otherwise be asked in the first reply. Staff count
 * is free text rather than a number, because "about 40" and "two departments"
 * are real answers and both beat a select somebody abandons.
 *
 * No consent box, deliberately. Nothing here signs anyone up to anything — the
 * only thing that will be done with the address is reply to the message it came
 * with, and asking permission for that would suggest something else is planned.
 */
const STAFF_SIZES = ["1–10", "11–50", "51–200", "201–1000", "More than 1000"];

export function ContactForm({ source }: { source?: string }) {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    submitEnquiryAction,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand-pale/40 p-8 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand/15">
          <Check className="size-6 text-brand" />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold">Thank you — we have it</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Someone will reply to the address you gave, usually within one working day. We will not
          add you to anything or email you about anything else.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : null;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="source" value={source ?? "contact"} />

      {/* Not shown, not announced, and never focusable by keyboard. */}
      <div aria-hidden className="hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" name="name" required autoComplete="name" placeholder="Ada Okonkwo" />
        <Field
          label="Work email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="ada@organisation.com"
        />
        <Field
          label="Organisation"
          name="organisation"
          autoComplete="organization"
          placeholder="Where you work"
        />
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="Optional" />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          How many staff would be trained? <span className="text-muted-foreground">(optional)</span>
        </span>
        <select
          name="staffCount"
          defaultValue=""
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
        >
          <option value="">Not sure yet</option>
          {STAFF_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          What do you need? <span className="text-brand">*</span>
        </span>
        <textarea
          name="message"
          required
          rows={5}
          maxLength={4000}
          placeholder="Which training, for which teams, and any deadline you are working to."
          className="w-full min-w-0 resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-brand"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Sending…" : "Send enquiry"}
        {!pending && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
      </button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        We use what you send here to reply to you and nothing else. See{" "}
        <a href="/privacy" className="font-medium text-brand hover:underline">
          how we handle your data
        </a>
        .
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  ...rest
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label} {required && <span className="text-brand">*</span>}
      </span>
      <input
        name={name}
        required={required}
        className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
        {...rest}
      />
    </label>
  );
}
