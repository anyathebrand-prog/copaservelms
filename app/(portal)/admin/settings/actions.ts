"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { updateSettings, updateOrganizationBranding } from "@/lib/settings";

/** Platform branding (PRD §13.3). */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  if (!isAdmin(user.roles)) throw new Error("Admin access required.");
  return user;
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const result = await updateSettings(
    {
      institutionName: String(formData.get("institutionName") ?? ""),
      supportEmail: String(formData.get("supportEmail") ?? ""),
      logoUrl: String(formData.get("logoUrl") ?? ""),
      primaryColor: String(formData.get("primaryColor") ?? ""),
      signatoryName: String(formData.get("signatoryName") ?? ""),
      signatoryTitle: String(formData.get("signatoryTitle") ?? ""),
    },
    user.id,
  );

  if (!result.ok) throw new Error(result.detail);

  // Branding appears on public pages, which are cached at the edge.
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateOrgBrandingAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");

  const result = await updateOrganizationBranding(
    organizationId,
    {
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
      primaryColor: String(formData.get("primaryColor") ?? "") || null,
    },
    user.id,
  );

  if (!result.ok) throw new Error(result.detail);
  revalidatePath(`/admin/organizations/${organizationId}`);
}
