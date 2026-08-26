"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { enrolFree, startCheckout } from "@/lib/payments";
import type { PaymentProvider } from "@/app/generated/prisma/enums";

/**
 * Enrolment entry point.
 *
 * The course id comes from the form, but nothing about the *price* does: both
 * paths re-read the course server-side, so a tampered form can at worst point
 * at a different course, and that course's real price is what applies.
 */
export async function enrolAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const user = await getCurrentUser();
  if (!user) {
    // Send them to sign in, then straight back to the course.
    redirect(`/login?next=${encodeURIComponent(`/courses/${slug}`)}`);
  }

  const provider = (formData.get("provider") as PaymentProvider) || null;

  if (!provider) {
    const result = await enrolFree(user.id, courseId);
    if (!result.ok) throw new Error(`Could not enrol: ${result.detail ?? result.error}`);

    revalidatePath("/student");
    revalidatePath("/student/courses");
    redirect(`/student/courses/${slug}`);
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";

  const result = await startCheckout(user.id, courseId, provider, `${proto}://${host}`);

  if (!result.ok) {
    if (result.error === "ALREADY_ENROLLED") redirect(`/student/courses/${slug}`);
    throw new Error(`Could not start checkout: ${result.detail ?? result.error}`);
  }

  // Off to the provider's hosted page — card details never touch this app.
  redirect(result.data.checkoutUrl);
}
