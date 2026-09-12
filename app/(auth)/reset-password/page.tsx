import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Reached from a recovery email, via /auth/callback.
 *
 * Deliberately not listed in the middleware's AUTH_ROUTES: a recovery link
 * signs the person in before they get here, and AUTH_ROUTES bounces a
 * signed-in user to /portal — which would make the link impossible to use.
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
