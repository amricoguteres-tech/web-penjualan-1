import { Suspense } from "react";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Create an account" };

export default function RegisterPage() {
  return <Suspense fallback={<main className="auth-page"><div className="auth-card">Loading account setup…</div></main>}><AuthForm mode="register" /></Suspense>;
}
