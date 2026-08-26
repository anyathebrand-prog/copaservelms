"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { scheduleLiveClass, updateLiveClass } from "@/lib/live-classes";
import type { LiveClassProvider, LiveClassStatus } from "@/app/generated/prisma/enums";

/** Live class scheduling (PRD §9.7, §10). Course ownership is checked in lib. */
async function requireInstructor() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");

  const permitted =
    user.roles.includes("INSTRUCTOR") ||
    user.roles.includes("ADMIN") ||
    user.roles.includes("SUPER_ADMIN");
  if (!permitted) throw new Error("Instructor access required.");

  return user;
}

export async function scheduleLiveClassAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();
  const courseId = String(formData.get("courseId") ?? "");

  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "").trim();

  const result = await scheduleLiveClass(courseId, user.id, user.roles, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    provider: (formData.get("provider") as LiveClassProvider) || "ZOOM",
    joinUrl: String(formData.get("joinUrl") ?? ""),
    // datetime-local has no timezone, so it is read in the server's zone.
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
  });

  if (!result.ok) {
    throw new Error(result.detail ?? `Could not schedule the session (${result.error}).`);
  }

  revalidatePath(`/instructor/courses/${courseId}/live-classes`);
  revalidatePath("/student/live-classes");
}

export async function updateLiveClassAction(formData: FormData): Promise<void> {
  const user = await requireInstructor();

  const status = String(formData.get("status") ?? "").trim();

  const result = await updateLiveClass(String(formData.get("liveClassId") ?? ""), user.id, user.roles, {
    joinUrl: formData.has("joinUrl") ? String(formData.get("joinUrl") ?? "") : undefined,
    recordingUrl: formData.has("recordingUrl") ? String(formData.get("recordingUrl") ?? "") : undefined,
    status: status ? (status as LiveClassStatus) : undefined,
  });

  if (!result.ok) {
    throw new Error(result.detail ?? `Could not update the session (${result.error}).`);
  }

  revalidatePath(`/instructor/courses/${result.data.courseId}/live-classes`);
  revalidatePath("/student/live-classes");
}
