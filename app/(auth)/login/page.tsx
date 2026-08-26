import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // Read on the server so the client never has to construct a
  // half-configured Supabase client to find out.
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    // useSearchParams() needs a Suspense boundary to avoid opting the whole
    // route into client-side rendering.
    <Suspense>
      <AuthForm mode="login" configured={configured} />
    </Suspense>
  );
}
