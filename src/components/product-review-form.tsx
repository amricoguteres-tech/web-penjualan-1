"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ProductReviewForm({ slug }: { slug: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLoginRequired(false);
    setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: Number(values.get("rating")), body: values.get("body") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setLoginRequired(response.status === 401);
        throw new Error(result.error ?? "Could not submit your review");
      }
      setMessage(result.message ?? "Your review is awaiting moderation.");
      form.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="product-review-form" onSubmit={submit}>
      <h3>Purchased this product?</h3>
      <p>Reviews are accepted from customers with a settled order and are moderated before publication.</p>
      <label>Rating<select name="rating" defaultValue="5"><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Okay</option><option value="2">2 — Poor</option><option value="1">1 — Bad</option></select></label>
      <label>Your review<textarea name="body" minLength={10} maxLength={2000} required /></label>
      {error && <span className="workspace-feedback-error" role="alert">{error} {loginRequired && <Link href={`/login?callbackUrl=${encodeURIComponent(`/products/${slug}`)}`}>Sign in</Link>}</span>}
      {message && <span className="workspace-section-feedback" role="status">{message}</span>}
      <button className="button button-quiet" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit review"}</button>
    </form>
  );
}
