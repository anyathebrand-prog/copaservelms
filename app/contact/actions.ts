"use server";

import { headers } from "next/headers";
import { submitEnquiry } from "@/lib/enquiries";

/**
 * Send a corporate enquiry, from the public site.
 *
 * Shaped for useActionState so the form is a plain `<form action={...}>`: it
 * submits as an ordinary POST and works with JavaScript disabled or still
 * downloading, which on a Nigerian mobile connection is a real state rather
 * than a hypothetical one.
 *
 * It is also what makes this path testable. A programmatically invoked action
 * takes an RSC-encoded argument stream that is impractical to reproduce outside
 * a browser; a form action is a normal multipart POST, so a script can exercise
 * the real thing end to end.
 */
export type ContactState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

export async function submitEnquiryAction(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const heads = await headers();

  const forwarded = heads.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0]!.trim() : null;

  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  // A field no human sees and no browser fills. Bots complete every input they
  // find, so anything in here is not a person — and it is answered with the
  // same success message rather than an error, because telling a bot which
  // check it failed is how the next attempt passes.
  if (field("website").trim()) return { status: "sent" };

  const result = await submitEnquiry({
    name: field("name"),
    email: field("email"),
    organisation: field("organisation"),
    phone: field("phone"),
    staffCount: field("staffCount"),
    message: field("message"),
    source: field("source") || "contact",
    ipAddress,
    userAgent: heads.get("user-agent") ?? null,
  });

  if (!result.ok) return { status: "error", message: result.detail };

  return { status: "sent" };
}
