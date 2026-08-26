"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { issueCertificate, revokeCertificate } from "@/lib/certificates/issue";

/** Certificate issuance and revocation (PRD §11.1, §11.4) — admin only. */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

export async function issueCertificateAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await issueCertificate(String(formData.get("enrollmentId") ?? ""), {
    actorId: user.id,
    // The admin is exercising the approval the course requires; the other
    // conditions still have to be genuinely met.
    overrideApproval: true,
  });

  if (!result.ok) {
    const detail = result.message ? ` — ${result.message}` : "";
    throw new Error(`Could not issue certificate (${result.error})${detail}`);
  }

  revalidatePath("/admin/certificates");
  revalidatePath("/student/certificates");
}

export async function revokeCertificateAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await revokeCertificate(
    String(formData.get("certificateId") ?? ""),
    user.id,
    String(formData.get("reason") ?? ""),
  );

  if (!result.ok) {
    throw new Error(
      result.error === "INVALID"
        ? "A revocation reason is required — it appears on the public verification page."
        : "That certificate no longer exists.",
    );
  }

  revalidatePath("/admin/certificates");
  revalidatePath("/student/certificates");
}
