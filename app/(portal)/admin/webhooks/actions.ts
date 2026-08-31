"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createEndpoint, deleteEndpoint, setEndpointActive } from "@/lib/webhooks";
import type { WebhookEvent } from "@/app/generated/prisma/enums";

/** Webhook management (PRD §13.3). Super Admin only: an endpoint receives real data. */
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!user.roles.includes("SUPER_ADMIN")) {
    throw new Error("Only a Super Admin can manage webhooks.");
  }
  return user;
}

/** Returns the signing secret once; it is not shown again. */
export async function createEndpointAction(
  formData: FormData,
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  const user = await requireSuperAdmin();

  const result = await createEndpoint(
    {
      name: String(formData.get("name") ?? ""),
      url: String(formData.get("url") ?? ""),
      events: (formData.getAll("events") as string[]).filter(Boolean) as WebhookEvent[],
      organizationId: (formData.get("organizationId") as string) || null,
    },
    user.id,
  );

  if (!result.ok) return { ok: false, error: result.detail ?? "That endpoint is not valid." };

  revalidatePath("/admin/webhooks");
  return { ok: true, secret: result.data.secret };
}

export async function deleteEndpointAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();
  const result = await deleteEndpoint(String(formData.get("endpointId") ?? ""), user.id);
  if (!result.ok) throw new Error("That endpoint no longer exists.");
  revalidatePath("/admin/webhooks");
}

export async function toggleEndpointAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const result = await setEndpointActive(
    String(formData.get("endpointId") ?? ""),
    formData.get("isActive") === "true",
  );
  if (!result.ok) throw new Error("That endpoint no longer exists.");
  revalidatePath("/admin/webhooks");
}
