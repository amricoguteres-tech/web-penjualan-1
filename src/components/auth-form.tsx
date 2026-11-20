"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";

type AuthMode = "login" | "register" | "forgot" | "reset";

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    try {
      if (isRegister) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not create your account");
        const signInResult = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (signInResult?.error) throw new Error("Account created. Please sign in to continue.");
        router.push("/dashboard");
        return;
      }

      if (isForgot) {
        const response = await fetch("/api/auth/password/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not request password reset");
        setMessage(result.message);
        return;
      }

      if (isReset) {
        const response = await fetch("/api/auth/password/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            token: searchParams.get("token"),
            password,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not reset your password");
        setMessage(result.message);
        return;
      }

      const callbackUrl = searchParams.get("callbackUrl");
      const safeCallback = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/dashboard";
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error("Email or password is incorrect.");
      router.push(safeCallback);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The request could not be completed");
    } finally {
      setBusy(false);
    }
  }

  const heading = isRegister ? "Create your account" : isForgot ? "Reset your password" : isReset ? "Choose a new password" : "Welcome back";
  const subheading = isRegister
    ? "One account. A universe of possibility."
    : isForgot
      ? "We’ll send a one-time reset link if the account can be recovered."
      : isReset
        ? "Use a strong password you have not used before."
        : "Sign in to continue to your digital universe.";

  return (
    <main className="auth-page">
      <div className="auth-stars" aria-hidden="true" />
      <Link className="brand auth-brand" href="/"><span className="brand-mark"><span>N</span></span><span>NEBULA <b>X</b></span></Link>
      <section className="auth-card">
        <div className="auth-overline"><ShieldCheck size={14} /> SECURE ACCOUNT ACCESS</div>
        <h1>{heading}</h1>
        <p className="auth-subheading">{subheading}</p>
        <form className="auth-fields" onSubmit={submit}>
          {isRegister && <label>Full name<input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label>}
          {!isReset && <label>Email address<input name="email" type="email" autoComplete="email" defaultValue={searchParams.get("email") ?? ""} maxLength={254} required /></label>}
          {isReset && <label>Email address<input name="email" type="email" autoComplete="email" defaultValue={searchParams.get("email") ?? ""} maxLength={254} required /></label>}
          {!isForgot && <label>Password<input name="password" type="password" autoComplete={isRegister || isReset ? "new-password" : "current-password"} minLength={isRegister || isReset ? 12 : 1} maxLength={128} required /><small>{(isRegister || isReset) ? "At least 12 characters with uppercase, lowercase and a number." : "Your password is never shared with the marketplace."}</small></label>}
          {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
          {message && <div className="auth-feedback auth-success" role="status">{message}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>
            {busy ? <><LoaderCircle className="auth-spinner" size={15} /> Please wait</> : <>{isRegister ? "Create account" : isForgot ? "Send reset link" : isReset ? "Update password" : "Sign in"} <ArrowRight size={15} /> </>}
          </button>
        </form>
        <div className="auth-links">
          {mode === "login" && <><a href="/forgot-password">Forgot password?</a><span>New to NEBULA X? <a href="/register">Create an account</a></span></>}
          {isRegister && <span>Already have an account? <a href="/login">Sign in</a></span>}
          {isForgot && <span>Remembered your password? <a href="/login">Sign in</a></span>}
          {isReset && <span>Need a fresh link? <a href="/forgot-password">Request another</a></span>}
        </div>
      </section>
      <p className="auth-footer">Your account is protected with secure sessions and encrypted password storage.</p>
    </main>
  );
}
