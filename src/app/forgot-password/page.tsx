import { Suspense } from "react";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Password recovery" };

export default function ForgotPasswordPage() {
  return <Suspense fallback={<main className="auth-page"><div className="auth-card">Loading password recovery…</div></main>}><AuthForm mode="forgot" /></Suspense>;
}
