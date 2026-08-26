"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createDataRequest, recordConsent, updateCommunicationPrefs, MANAGEABLE_CONSENTS } from "@/lib/privacy";
import type { ConsentType, DataRequestType } from "@/app/generated/prisma/enums";

/**
 * Privacy centre actions (PRD §12.2).
 *
 * The subject is always the session user. Nothing here takes a userId, so
 * there is no parameter an attacker could point at someone else's data.
 */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}

export async function setConsentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const requestHeaders = await headers();

  const type = String(formData.get("type") ?? "") as ConsentType;
  const grant = formData.get("grant") === "true";

  // Only marketing and cookie consents are user-toggleable. Policy acceptances
  // are recorded at signup and are not switches.
  if (!MANAGEABLE_CONSENTS.includes(type)) {
    throw new Error("That consent cannot be changed here.");
  }

  await recordConsent({
    userId: user.id,
    type,
    // Append, never overwrite: the history is the compliance record.
    action: grant ? "GRANTED" : "WITHDRAWN",
    ipAddress: requestHeaders.get("x-forwarded-for"),
    userAgent: requestHeaders.get("user-agent"),
  });

  revalidatePath("/student/privacy");
}

export async function requestDataAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const type = String(formData.get("type") ?? "") as DataRequestType;
  const allowed: DataRequestType[] = ["CORRECTION", "ERASURE", "OBJECTION", "ACCESS", "PORTABILITY"];
  if (!allowed.includes(type)) throw new Error("Unknown request type.");

  const result = await createDataRequest(user.id, type, String(formData.get("details") ?? ""));

  if (!result.ok) {
    throw new Error("You already have an open request of this type. We will respond to it shortly.");
  }

  revalidatePath("/student/privacy");
}

export async function setCommunicationPrefsAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  await updateCommunicationPrefs(user.id, {
    IN_APP: formData.get("IN_APP") === "on",
    EMAIL: formData.get("EMAIL") === "on",
    SMS: formData.get("SMS") === "on",
    PUSH: formData.get("PUSH") === "on",
  });

  revalidatePath("/student/privacy");
}
