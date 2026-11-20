import assert from "node:assert/strict";
import test from "node:test";
import { CouponDiscountType, PaymentStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hasAdminAccess } from "../src/lib/admin-access";
import {
  createMidtransEventKey,
  createMidtransSignature,
  decideMidtransTransition,
  mapMidtransPaymentStatus,
  midtransAmountMatches,
  verifyMidtransSignature,
} from "../src/lib/midtrans-webhook";
import { OrderStatus } from "@prisma/client";
import { calculateCouponDiscount } from "../src/lib/order-pricing";
import { validateDigitalAssetUpload, validateImageUpload } from "../src/lib/upload-validation";
import { HttpError, readJson } from "../src/lib/http";
import {
  createContentSecurityPolicy,
  createCspNonce,
  createCspResponseHeaders,
  sanitizeCspReportLocation,
} from "../src/lib/csp";
import { emailRetryDelayMs } from "../src/lib/email-outbox";
import { decryptEmailOutboxBody, encryptEmailOutboxBody, isEncryptedEmailOutboxBody } from "../src/lib/email-outbox-crypto";
import { getEnabledMidtransMethods } from "../src/lib/midtrans-config";
import { createQrisSnapPayload, getQrisPaymentExpiry, QRIS_PAYMENT_EXPIRY_MINUTES } from "../src/lib/midtrans-qris";
import { getAstronautGuideMessage, getAstronautReaction } from "../src/lib/astronaut-events";
import { resolveAstronautMotionPreference } from "../src/components/astronaut-performance-manager";

test("admin access is limited to admin roles", () => {
  assert.equal(hasAdminAccess(UserRole.USER), false);
  assert.equal(hasAdminAccess(null), false);
  assert.equal(hasAdminAccess(UserRole.ADMIN), true);
  assert.equal(hasAdminAccess(UserRole.SUPER_ADMIN), true);
});

test("password hashes verify without storing the original password", async () => {
  const password = "Nebula-Secure-Test-42";
  const hash = await bcrypt.hash(password, 12);
  assert.notEqual(hash, password);
  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(await bcrypt.compare("another-password", hash), false);
});

test("coupon discounts are calculated using integer rupiah", () => {
  assert.equal(calculateCouponDiscount(101_000, CouponDiscountType.PERCENTAGE, 15), 15_150);
  assert.equal(calculateCouponDiscount(10_000, CouponDiscountType.FIXED, 50_000), 10_000);
  assert.throws(() => calculateCouponDiscount(0, CouponDiscountType.FIXED, 1), RangeError);
  assert.throws(() => calculateCouponDiscount(10_000, CouponDiscountType.PERCENTAGE, 101), RangeError);
});

test("Midtrans signatures are verified using the signed order fields", () => {
  const signature = createMidtransSignature("order-42", "200", "10000.00", "server-key");
  assert.equal(verifyMidtransSignature(signature, "order-42", "200", "10000.00", "server-key"), true);
  assert.equal(verifyMidtransSignature(signature, "order-42", "201", "10000.00", "server-key"), false);
  assert.equal(verifyMidtransSignature("not-a-signature", "order-42", "200", "10000.00", "server-key"), false);
});

test("Midtrans status mapping preserves expected payment states", () => {
  assert.equal(mapMidtransPaymentStatus("settlement"), PaymentStatus.SETTLEMENT);
  assert.equal(mapMidtransPaymentStatus("capture", "accept"), PaymentStatus.SETTLEMENT);
  assert.equal(mapMidtransPaymentStatus("capture", "challenge"), PaymentStatus.PENDING);
  assert.equal(mapMidtransPaymentStatus("capture", "deny"), PaymentStatus.FAILED);
  assert.equal(mapMidtransPaymentStatus("expire"), PaymentStatus.EXPIRED);
  assert.equal(mapMidtransPaymentStatus("deny"), PaymentStatus.FAILED);
  assert.equal(mapMidtransPaymentStatus("cancel"), PaymentStatus.FAILED);
});

test("Midtrans status transitions cover success, pending, failures, and late settlement", () => {
  assert.equal(decideMidtransTransition(PaymentStatus.PENDING, OrderStatus.PENDING, PaymentStatus.SETTLEMENT), "settle");
  assert.equal(decideMidtransTransition(PaymentStatus.PENDING, OrderStatus.PENDING, PaymentStatus.PENDING), "ignore");
  assert.equal(decideMidtransTransition(PaymentStatus.PENDING, OrderStatus.PENDING, PaymentStatus.EXPIRED), "fail");
  assert.equal(decideMidtransTransition(PaymentStatus.PENDING, OrderStatus.PENDING, PaymentStatus.FAILED), "fail");
  assert.equal(decideMidtransTransition(PaymentStatus.EXPIRED, OrderStatus.CANCELLED, PaymentStatus.SETTLEMENT), "reconcile");
  assert.equal(decideMidtransTransition(PaymentStatus.FAILED, OrderStatus.CANCELLED, PaymentStatus.EXPIRED), "ignore");
  assert.equal(decideMidtransTransition(PaymentStatus.SETTLEMENT, OrderStatus.PAID, PaymentStatus.FAILED), "ignore");
});

test("Midtrans notification keys are stable and amount validation rejects mismatches", () => {
  const eventKey = createMidtransEventKey("order-42", "expire", "transaction-1", "407");
  assert.equal(eventKey, createMidtransEventKey("order-42", "expire", "transaction-1", "407"));
  assert.notEqual(eventKey, createMidtransEventKey("order-42", "deny", "transaction-1", "407"));
  assert.equal(midtransAmountMatches("10000.00", 10_000), true);
  assert.equal(midtransAmountMatches("10001.00", 10_000), false);
  assert.equal(midtransAmountMatches("10.50", 10_000), false);
});

test("Snap checkout payload and enabled methods are QRIS only with server-calculated amount", () => {
  const previousServerKey = process.env.MIDTRANS_SERVER_KEY;
  const previousClientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  const previousMethods = process.env.MIDTRANS_ENABLED_PAYMENTS;
  try {
    process.env.MIDTRANS_SERVER_KEY = "server-test-key";
    process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY = "client-test-key";
    process.env.MIDTRANS_ENABLED_PAYMENTS = "dana,bank_transfer,gopay";
    assert.deepEqual(getEnabledMidtransMethods(), ["qris"]);
    const request = createQrisSnapPayload({
      orderId: "nebula-order-123",
      returnOrderId: "order-123",
      amountInIdr: 12_500,
      customerName: "Test Customer",
      customerEmail: "customer@example.test",
      siteUrl: "https://nebula.example.test",
      startTime: new Date("2026-11-19T10:00:00.000Z"),
    });

    assert.deepEqual(request.enabled_payments, ["qris"]);
    assert.equal(request.transaction_details.gross_amount, 12_500);
    assert.equal(request.expiry.duration, QRIS_PAYMENT_EXPIRY_MINUTES);
    assert.equal(request.expiry.start_time, "2026-11-19 17:00:00 +0700");
    assert.equal(request.callbacks.finish, "https://nebula.example.test/payments/order-123");
    assert.throws(() => createQrisSnapPayload({
      orderId: "invalid-amount",
      returnOrderId: "invalid-amount",
      amountInIdr: 0,
      customerName: "Test",
      customerEmail: "customer@example.test",
      siteUrl: "https://nebula.example.test",
      startTime: new Date("2026-11-19T10:00:00.000Z"),
    }), RangeError);
    const createdAt = new Date("2026-11-19T10:00:00.000Z");
    assert.equal(getQrisPaymentExpiry(createdAt).getTime() - createdAt.getTime(), 15 * 60_000);
  } finally {
    if (previousServerKey === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = previousServerKey;
    if (previousClientKey === undefined) delete process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
    else process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY = previousClientKey;
    if (previousMethods === undefined) delete process.env.MIDTRANS_ENABLED_PAYMENTS;
    else process.env.MIDTRANS_ENABLED_PAYMENTS = previousMethods;
  }
});

test("astronaut guide maps navigation and product events to scripted gestures", () => {
  assert.match(getAstronautGuideMessage({ type: "USER_CLICK_ASTRONAUT" }).text, /Welcome aboard/);
  assert.equal(getAstronautGuideMessage({ type: "USER_OPEN_PRODUCT", productName: "Nebula VPS" }).gesture, "Point_Forward");
  assert.match(getAstronautGuideMessage({ type: "USER_OPEN_PRODUCT", productName: "Nebula VPS" }).text, /Nebula VPS/);
  assert.equal(getAstronautGuideMessage({ type: "USER_OPEN_VPS" }).gesture, "Point_Left");
  assert.equal(getAstronautGuideMessage({ type: "USER_OPEN_CHECKOUT" }).gesture, "Thinking");
  assert.equal(getAstronautGuideMessage({ type: "PAYMENT_SUCCESS" }).gesture, "Celebrate");
  assert.equal(getAstronautGuideMessage({ type: "SECTION_CHANGED", section: "marketplace" }).gesture, "Point_Right");
  assert.equal(getAstronautGuideMessage({ type: "USER_CLICK_ASTRONAUT", interaction: "thumbs-up" }).gesture, "Thumbs_Up");
  assert.match(getAstronautGuideMessage({ type: "USER_OPEN_EMPTY_STATE" }).text, /Nothing in this sector/);
  assert.deepEqual(getAstronautReaction({ type: "PAYMENT_SUCCESS" }), {
    gesture: "Celebrate",
    personality: "Celebrating",
    priority: 4,
    durationMs: 4000,
  });
  assert.equal(getAstronautReaction({ type: "USER_OPEN_VPS" }).personality, "Guiding");
});

test("astronaut motion preference respects explicit user choice over system default", () => {
  assert.equal(resolveAstronautMotionPreference(null, true), true);
  assert.equal(resolveAstronautMotionPreference("full", true), false);
  assert.equal(resolveAstronautMotionPreference("reduce", false), true);
});

test("upload validation checks content type, signatures, and configured size limits", () => {
  assert.equal(validateImageUpload("image/jpeg", Buffer.from([0xff, 0xd8, 0xff])), "jpg");
  assert.equal(
    validateImageUpload("image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "png",
  );
  assert.equal(
    validateImageUpload("image/webp", Buffer.from("RIFF1234WEBP")),
    "webp",
  );
  assert.equal(validateDigitalAssetUpload("application/pdf", Buffer.from("%PDF-1.7")), "pdf");
  assert.equal(
    validateDigitalAssetUpload("application/zip", Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    "zip",
  );
  assert.throws(() => validateImageUpload("image/png", Buffer.from("not-a-png")));
  assert.throws(() => validateImageUpload("image/svg+xml", Buffer.from("<svg/>")));
  assert.throws(() => validateDigitalAssetUpload("application/pdf", Buffer.from("not-a-pdf")));
  assert.throws(() => validateImageUpload("image/jpeg", Buffer.alloc(5 * 1024 * 1024 + 1)));
  assert.throws(() => validateDigitalAssetUpload("application/zip", Buffer.alloc(50 * 1024 * 1024 + 1)));
});

test("JSON request parsing enforces a streaming body limit", async () => {
  const parsed = await readJson(new Request("http://localhost/api/test", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
  }), 32);
  assert.deepEqual(parsed, { ok: true });

  await assert.rejects(
    () => readJson(new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ value: "this request is larger than its limit" }),
    }), 16),
    (error: unknown) => error instanceof HttpError && error.status === 413,
  );
});

test("CSP uses unique per-request nonces and restricts sources without unsafe-eval", () => {
  const firstNonce = createCspNonce();
  const secondNonce = createCspNonce();
  assert.notEqual(firstNonce, secondNonce);
  assert.match(firstNonce, /^[A-Za-z0-9+/]+=*$/);

  const policy = createContentSecurityPolicy(firstNonce, true);
  const enforcedPolicy = createContentSecurityPolicy(firstNonce, true, true);
  assert.ok(policy.includes(`script-src 'self' 'nonce-${firstNonce}' 'strict-dynamic'`));
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
  assert.match(enforcedPolicy, /upgrade-insecure-requests/);
  assert.match(policy, /style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(policy, /unsafe-eval|https:\s*;/);
  assert.doesNotMatch(policy, /Content-Security-Policy;/);
  const headers = createCspResponseHeaders(firstNonce, true);
  assert.equal(headers.reportOnlyHeader, "Content-Security-Policy-Report-Only");
  assert.doesNotMatch(headers.reportOnlyPolicy, /upgrade-insecure-requests/);
  assert.match(headers.enforcementPolicy, /upgrade-insecure-requests/);
  assert.equal(sanitizeCspReportLocation("https://cdn.example.test/app.js?token=secret#section"), "https://cdn.example.test/app.js");
  assert.equal(sanitizeCspReportLocation("inline"), "inline");
  assert.equal(sanitizeCspReportLocation("data:text/html,private"), "data");
});

test("email retry backoff is exponential and bounded", () => {
  assert.equal(emailRetryDelayMs(1), 30_000);
  assert.equal(emailRetryDelayMs(2), 60_000);
  assert.equal(emailRetryDelayMs(3), 120_000);
  assert.equal(emailRetryDelayMs(12), 21_600_000);
});

test("email outbox payloads are authenticated and encrypted at rest", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const message = "A password reset link contains a sensitive bearer token.";
  const encrypted = encryptEmailOutboxBody(message, key);
  assert.notEqual(encrypted, message);
  assert.ok(isEncryptedEmailOutboxBody(encrypted));
  assert.equal(decryptEmailOutboxBody(encrypted, key), message);
  assert.throws(() => decryptEmailOutboxBody(`${encrypted.slice(0, -2)}xx`, key));
});
