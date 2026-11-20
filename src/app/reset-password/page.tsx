import { Suspense } from "react";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page"><div className="auth-card">Loading password reset…</div></main>}><AuthForm mode="reset" /></Suspense>;
}
