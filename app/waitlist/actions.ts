"use server";

import { headers } from "next/headers";
import { joinWaitlist } from "@/lib/waitlist";

/**
 * Join the waitlist, from the public landing page.
 *
 * Shaped for useActionState so the form is a plain `<form action={...}>`:
 * it then submits as an ordinary POST and works with JavaScript disabled or
 * still downloading, which on a Nigerian mobile connection is a real state and
 * not a hypothetical one.
 *
 * It is also the reason this path can be tested at all. A programmatically
 * invoked action takes an RSC-encoded argument stream that is impractical to
 * reproduce outside a browser; a form action is a normal multipart POST, so a
 * script can exercise the real thing end to end.
 *
 * No authentication, so the inputs are treated as hostile: the email is
 * validated and lowercased downstream, everything else is trimmed and
 * length-capped, and nothing is echoed back into the page.
 */
export type WaitlistState =
  | { status: "idle" }
  | { status: "joined"; alreadyOn: boolean }
  | { status: "error"; message: string };

export async function joinWaitlistAction(
  _previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const heads = await headers();

  // Kept for the consent record, which under the NDPA is evidence of who
  // agreed and from where, not analytics.
  const forwarded = heads.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0]!.trim() : null;

  const cap = (value: FormDataEntryValue | null, limit: number) =>
    typeof value === "string" ? value.slice(0, limit) : null;

  // The checkbox is required in the markup, but markup is a suggestion to
  // anyone posting directly. Consent is the one thing that must be true.
  if (!formData.get("consent")) {
    return { status: "error", message: "Please agree to be emailed before joining." };
  }

  const result = await joinWaitlist({
    email: cap(formData.get("email"), 200) ?? "",
    name: cap(formData.get("name"), 120),
    organisation: cap(formData.get("organisation"), 160),
    interest: cap(formData.get("interest"), 80),
    source: cap(formData.get("source"), 80),
    ipAddress,
    userAgent: heads.get("user-agent")?.slice(0, 300) ?? null,
  });

  if (!result.ok) {
    return { status: "error", message: result.detail ?? "We could not add you just now." };
  }

  return { status: "joined", alreadyOn: result.data.alreadyOn };
}
