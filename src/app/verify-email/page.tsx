import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import EmailVerificationForm from "@/components/email-verification-form";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <main className="auth-page">
      <div className="auth-stars" aria-hidden="true" />
      <Link className="brand auth-brand" href="/"><span className="brand-mark"><span>N</span></span><span>NEBULA <b>X</b></span></Link>
      <section className="auth-card">
        <div className="auth-overline">SECURE ACCOUNT ACCESS</div>
        <h1>Verify your email</h1>
        <p className="auth-subheading">Confirm ownership of your email address to activate account access.</p>
        <Suspense fallback={<div className="auth-feedback" role="status">Loading verification details…</div>}>
          <EmailVerificationForm />
        </Suspense>
      </section>
    </main>
  );
}
