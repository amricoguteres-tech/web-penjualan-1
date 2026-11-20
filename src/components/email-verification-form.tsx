"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function EmailVerificationForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not verify this email");
      setMessage(result.message);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Could not verify this email.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not request a verification email");
      setMessage(result.message);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Could not request a verification email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-fields">
      {email && <p className="auth-subheading">Address: {email}</p>}
      {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
      {message && <div className="auth-feedback auth-success" role="status">{message}</div>}
      {token && <button className="button button-primary auth-submit" type="button" disabled={busy} onClick={() => void verify()}>{busy ? "Verifying…" : "Verify email"}</button>}
      {email && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void resend()}>Resend verification email</button>}
      {message.includes("verified") && <Link className="button button-quiet" href="/login">Continue to sign in</Link>}
      {!email && <p className="auth-subheading">Open the verification link from your email, or sign in after email verification is disabled by the administrator.</p>}
    </div>
  );
}
