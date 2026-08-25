import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    // useSearchParams() needs a Suspense boundary to avoid opting the whole
    // route into client-side rendering.
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
