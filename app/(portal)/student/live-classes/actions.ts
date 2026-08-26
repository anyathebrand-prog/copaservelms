"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { recordAttendance } from "@/lib/live-classes";

/**
 * Join a live class (PRD §9.7).
 *
 * The join link is never rendered in the page. It is returned only here, after
 * attendance is recorded, so opening a session is always attributable — which
 * is what the attendance requirement for certificates (§11.1) rests on.
 */
export async function joinLiveClassAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const result = await recordAttendance(String(formData.get("liveClassId") ?? ""), user.id);

  if (!result.ok) {
    throw new Error(
      result.detail ??
        (result.error === "NOT_ENROLLED"
          ? "That session is not available to you."
          : "That session could not be joined."),
    );
  }

  revalidatePath("/student/live-classes");

  if (!result.data.joinUrl) {
    throw new Error("Your instructor has not added a join link for this session yet.");
  }

  redirect(result.data.joinUrl);
}
