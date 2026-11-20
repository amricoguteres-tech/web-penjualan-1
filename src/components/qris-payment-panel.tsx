"use client";

import Script from "next/script";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, Clock3, ExternalLink, LoaderCircle, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import AstronautGuide from "@/components/astronaut-guide";
import { emitAstronautEvent } from "@/lib/astronaut-events";

type PaymentData = {
  orderId: string;
  orderStatus: string;
  amountInIdr: number;
  status: "PENDING" | "SETTLEMENT" | "FAILED" | "EXPIRED" | "REFUNDED";
  transactionToken: string | null;
  expiresAt: string | null;
  updatedAt: string;
  invoiceNumber: string | null;
};

type SnapCallbacks = {
  onSuccess: () => void;
  onPending: () => void;
  onError: () => void;
  onClose: () => void;
};

declare global {
  interface Window {
    snap?: {
      embed: (token: string, options: SnapCallbacks & { embedId: string }) => void;
    };
  }
}

function subscribeToClock(callback: () => void) {
  const timer = window.setInterval(callback, 1000);
  return () => window.clearInterval(timer);
}

function getClockSnapshot() {
  return Date.now();
}

export default function QrisPaymentPanel({
  orderId,
  invoiceNumber,
  amountInIdr,
  orderStatus,
  paymentStatus,
  transactionToken,
  expiresAt,
  updatedAt,
  clientKey,
  snapJsUrl,
  nonce,
  initialNow,
}: {
  orderId: string;
  invoiceNumber: string;
  amountInIdr: number;
  orderStatus: string;
  paymentStatus: PaymentData["status"];
  transactionToken: string | null;
  expiresAt: string | null;
  updatedAt: string;
  clientKey: string;
  snapJsUrl: string;
  nonce?: string;
  initialNow: number;
}) {
  const [payment, setPayment] = useState<PaymentData>({
    orderId,
    invoiceNumber,
    amountInIdr,
    orderStatus,
    status: paymentStatus,
    transactionToken,
    expiresAt,
    updatedAt,
  });
  const getServerClockSnapshot = useCallback(() => initialNow, [initialNow]);
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const [snapReady, setSnapReady] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const embedTarget = useRef<HTMLDivElement>(null);

  const refreshPayment = useCallback(async () => {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payment`, {
      cache: "no-store",
    });
    const result: { payment?: PaymentData; error?: string } = await response.json();
    if (!response.ok || !result.payment) throw new Error(result.error ?? "Could not load payment status.");
    setPayment(result.payment);
    return result.payment;
  }, [orderId]);

  const handleSnapCallback = useCallback((message: string) => {
    setStatusMessage(message);
    setErrorMessage("");
    void refreshPayment().catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not verify the payment status.");
    });
  }, [refreshPayment]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (payment.status === "PENDING") {
        void refreshPayment().catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Payment status is temporarily unavailable.");
        });
      }
    }, 10_000);
    return () => window.clearInterval(poll);
  }, [payment.status, refreshPayment]);

  useEffect(() => {
    if (payment.status === "SETTLEMENT") emitAstronautEvent({ type: "PAYMENT_SUCCESS" });
  }, [payment.status]);

  function showQris() {
    if (!window.snap || !payment.transactionToken || !embedTarget.current) {
      setErrorMessage("Midtrans QRIS checkout is not ready. Please retry in a moment.");
      return;
    }
    try {
      setErrorMessage("");
      setStatusMessage("");
      window.snap.embed(payment.transactionToken, {
        embedId: "midtrans-qris-container",
        onSuccess: () => handleSnapCallback("Payment confirmation received. Checking the server-verified payment record…"),
        onPending: () => handleSnapCallback("Payment is pending. Complete the QRIS payment, then check its status."),
        onError: () => handleSnapCallback("Midtrans reported a payment issue. Checking the verified status…"),
        onClose: () => handleSnapCallback("QRIS checkout closed. Your payment remains pending until verified."),
      });
      setEmbedded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not open Midtrans QRIS checkout.");
    }
  }

  async function checkStatus() {
    setChecking(true);
    setErrorMessage("");
    setStatusMessage("Checking the transaction directly with Midtrans…");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Midtrans status could not be verified.");
      await refreshPayment();
      setStatusMessage("Payment status refreshed from Midtrans.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Midtrans status could not be verified.");
    } finally {
      setChecking(false);
    }
  }

  const expiryTimestamp = payment.expiresAt ? new Date(payment.expiresAt).getTime() : 0;
  const remainingMs = expiryTimestamp ? Math.max(0, expiryTimestamp - now) : 0;
  const countdown = `${String(Math.floor(remainingMs / 60_000)).padStart(2, "0")}:${String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, "0")}`;
  const settled = payment.status === "SETTLEMENT";
  const expired = payment.status === "EXPIRED";
  const failed = payment.status === "FAILED" || payment.status === "REFUNDED";
  const snapCanLoad = snapReady && Boolean(clientKey && payment.transactionToken) && payment.status === "PENDING";

  return (
    <>
      {clientKey && payment.status === "PENDING" && (
        <Script
          src={snapJsUrl}
          strategy="afterInteractive"
          data-client-key={clientKey}
          nonce={nonce}
          onLoad={() => setSnapReady(true)}
          onError={() => setErrorMessage("Midtrans Snap could not be loaded. Please reload this page or contact support.")}
        />
      )}
      <section className="qris-payment-card" aria-labelledby="qris-payment-title">
        <Link className="qris-back-link" href="/dashboard"><ArrowLeft size={14} /> Orders &amp; invoices</Link>
        <div className="qris-payment-heading">
          <span className="qris-eyebrow"><span className="qris-live-dot" /> MIDTRANS SNAP / QRIS ONLY</span>
          <h1 id="qris-payment-title">{settled ? "Payment confirmed" : expired ? "Payment expired" : failed ? "Payment unsuccessful" : "Complete your payment"}</h1>
          <p>{settled
            ? "The payment has been verified by the server."
            : expired
              ? "This QRIS payment has expired. Check the latest transaction status before taking further action."
              : failed
                ? "The provider did not settle this payment. Check the verified status or contact support."
                : "Scan the dynamic QR code generated securely for this order."}</p>
        </div>
        <AstronautGuide compact />

        <div className={`qris-status-banner ${settled ? "is-success" : expired || failed ? "is-failed" : ""}`} role="status">
          {settled ? <Check size={17} /> : <Clock3 size={17} />}
          <span><b>{settled ? "SUCCESS" : expired ? "EXPIRED" : failed ? payment.status : "PENDING"}</b><small>{settled ? "Confirmed by Midtrans notification/status API" : expired || failed ? "Payment is not marked paid" : "Waiting for payment confirmation from Midtrans"}</small></span>
          {!settled && !expired && !failed && <strong>{countdown}</strong>}
        </div>

        <div className="qris-payment-grid">
          <div className="qris-code-panel">
            <div className="qris-code-heading"><span><QrCode size={16} /> DYNAMIC QRIS</span><small>ORDER-SPECIFIC</small></div>
            <div className={`midtrans-snap-frame ${embedded ? "has-snap" : ""}`}>
              {payment.status === "PENDING" && (
                <>
                  {!embedded && <div className="qris-code-placeholder"><div><QrCode size={38} /><span>QR GENERATED BY MIDTRANS</span></div></div>}
                  <div id="midtrans-qris-container" ref={embedTarget} />
                  {!embedded && <button className="button button-primary qris-open-button" type="button" onClick={showQris} disabled={!snapCanLoad}>
                    {!clientKey || !payment.transactionToken
                      ? "QRIS checkout unavailable"
                      : snapReady
                        ? "Generate dynamic QR"
                        : <><LoaderCircle className="qris-spin" size={15} /> Connecting to Midtrans…</>}
                  </button>}
                </>
              )}
              {settled && <div className="qris-terminal-state is-success"><Check size={34} /><b>Payment secured</b><span>Your order is being processed.</span></div>}
              {(expired || failed) && <div className="qris-terminal-state"><Clock3 size={31} /><b>No active QR code</b><span>Contact support before retrying this order.</span></div>}
            </div>
            <p className="qris-supported-apps">Bayar menggunakan DANA atau aplikasi pembayaran lain yang mendukung QRIS.</p>
            <p className="qris-security-note"><ShieldCheck size={13} /> Never share your QR code or payment details with others.</p>
          </div>

          <aside className="qris-order-summary">
            <span className="qris-eyebrow">PAYMENT SUMMARY</span>
            <div className="qris-amount-label">Exact amount to pay</div>
            <div className="qris-amount">{formatPrice(payment.amountInIdr)}</div>
            <dl>
              <div><dt>Order number</dt><dd>{payment.orderId}</dd></div>
              <div><dt>Invoice</dt><dd>{payment.invoiceNumber ?? invoiceNumber}</dd></div>
              <div><dt>Payment method</dt><dd className="qris-method-value"><QrCode size={14} /> QRIS</dd></div>
              <div><dt>Order status</dt><dd>{payment.orderStatus}</dd></div>
              <div><dt>Last updated</dt><dd>{new Date(payment.updatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC</dd></div>
            </dl>
            {!settled && payment.status === "PENDING" && now > 0 && remainingMs === 0 && (
              <div className="qris-expiry-note">The countdown has ended. The payment is still pending until Midtrans verifies its final status.</div>
            )}
            {statusMessage && <p className="qris-status-message" role="status">{statusMessage}</p>}
            {errorMessage && <p className="qris-error-message" role="alert">{errorMessage}</p>}
            <button className="button button-quiet qris-check-button" type="button" onClick={checkStatus} disabled={checking || settled}>
              {checking ? <><LoaderCircle className="qris-spin" size={15} /> Checking…</> : <><RefreshCw size={14} /> Check payment status</>}
            </button>
            {settled && <Link className="qris-invoice-link" href="/dashboard">View your order <ExternalLink size={13} /></Link>}
            <p className="qris-trust-copy">NEBULA X will only mark an order paid after server-side verification with Midtrans. Browser confirmation alone does not complete payment.</p>
          </aside>
        </div>
      </section>
    </>
  );
}
