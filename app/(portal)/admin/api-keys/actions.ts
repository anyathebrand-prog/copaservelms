"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import type { ApiScope } from "@/app/generated/prisma/enums";

/** API key management (PRD §13.3). Super Admin only: a key is platform access. */
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!user.roles.includes("SUPER_ADMIN")) {
    throw new Error("Only a Super Admin can manage API keys.");
  }
  return user;
}

/**
 * Create a key and return the plaintext once.
 *
 * It is returned rather than stored anywhere retrievable, so the page can show
 * it a single time. There is no way to see it again — only to replace it.
 */
export async function createApiKeyAction(
  formData: FormData,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const user = await requireSuperAdmin();

  const scopes = (formData.getAll("scopes") as string[]).filter(Boolean) as ApiScope[];
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();

  const result = await createApiKey(
    {
      name: String(formData.get("name") ?? ""),
      scopes,
      organizationId: (formData.get("organizationId") as string) || null,
      expiresAt: expiresRaw ? new Date(expiresRaw) : null,
    },
    user.id,
  );

  if (!result.ok) return { ok: false, error: result.detail ?? "That key is not valid." };

  revalidatePath("/admin/api-keys");
  return { ok: true, key: result.data.key };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const user = await requireSuperAdmin();
  const result = await revokeApiKey(String(formData.get("keyId") ?? ""), user.id);
  if (!result.ok) throw new Error("That key no longer exists.");
  revalidatePath("/admin/api-keys");
}
