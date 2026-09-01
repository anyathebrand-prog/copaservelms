"use server";

import { headers } from "next/headers";
import { joinWaitlist } from "@/lib/waitlist";

/**
 * Join the waitlist, from the public landing page.
 *
 * No authentication, so the inputs are treated as hostile: the email is
 * validated and lowercased, everything else is trimmed and length-capped, and
 * nothing here is echoed back into the page.
 */
export async function joinWaitlistAction(
  formData: FormData,
): Promise<{ ok: true; alreadyOn: boolean } | { ok: false; error: string }> {
  const heads = await headers();

  // Kept for the consent record, which under the NDPA is evidence of who
  // agreed and from where, not analytics.
  const forwarded = heads.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0]!.trim() : null;

  const cap = (value: FormDataEntryValue | null, limit: number) =>
    typeof value === "string" ? value.slice(0, limit) : null;

  const result = await joinWaitlist({
    email: cap(formData.get("email"), 200) ?? "",
    name: cap(formData.get("name"), 120),
    organisation: cap(formData.get("organisation"), 160),
    interest: cap(formData.get("interest"), 80),
    source: cap(formData.get("source"), 80),
    ipAddress,
    userAgent: heads.get("user-agent")?.slice(0, 300) ?? null,
  });

  if (!result.ok) return { ok: false, error: result.detail ?? "We could not add you just now." };
  return { ok: true, alreadyOn: result.data.alreadyOn };
}
