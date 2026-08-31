"use client";

import { useFormStatus } from "react-dom";

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
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingLabel ?? "Working…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
