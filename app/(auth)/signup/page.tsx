import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { getEnabledProviders } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const providers = await getEnabledProviders();

  return (
    <Suspense>
      <AuthForm mode="signup" configured={configured} providers={providers} />
    </Suspense>
  );
}
