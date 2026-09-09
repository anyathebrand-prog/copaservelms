"use client";

import { useFormStatus } from "react-dom";
import { MarkLoader } from "@/components/brand/mark-loader";

/**
 * A submit button that shows it is working.
 *
 * Server actions round-trip to the function region, which is several hundred
 * milliseconds even when everything is healthy. Without feedback the page
 * simply sits there, and the honest conclusion for anyone using it is that the
 * click did nothing — which is exactly what was reported for course creation,
 * where the course had in fact been created.
 *
 * Disabling while pending also prevents the double submit that follows from
 * clicking again, which for a create form means two records instead of one.
 *
 * The pending indicator is the brand mark rather than a generic ring, so every
 * wait on the platform looks like the same thing happening.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
  disabled = false,
  ...rest
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled">) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
      {...rest}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          {/* 18px, not the 14px the old ring used: below about 18 the mark's
              counters close up and it reads as a green smudge rather than as
              the logo. aria-busy on the button already announces the state, so
              the loader itself is silent here. */}
          <MarkLoader size={18} label="" />
          {pendingLabel ?? "Working…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
