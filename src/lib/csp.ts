import { randomBytes } from "node:crypto";

export function createCspNonce() {
  return randomBytes(18).toString("base64");
}

export function sanitizeCspReportLocation(value?: string) {
  if (!value) return undefined;
  const marker = value.toLowerCase();
  if (["inline", "eval", "wasm-eval", "trusted-types-sink"].includes(marker)) {
    return marker;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "data:" || url.protocol === "blob:") return url.protocol.slice(0, -1);
    if (url.protocol !== "http:" && url.protocol !== "https:") return url.protocol.slice(0, -1);
    return `${url.origin}${url.pathname}`.slice(0, 256);
  } catch {
    return "other";
  }
}

function configuredImageOrigins() {
  return (process.env.CSP_IMAGE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => {
      try {
        const url = new URL(origin);
        return url.protocol === "https:" && url.origin === origin;
      } catch {
        return false;
      }
    });
}

export function createContentSecurityPolicy(
  nonce: string,
  isProduction = process.env.NODE_ENV === "production",
  enforce = false,
) {
  const midtransApp = process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
  const midtransApi = process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${midtransApp}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${configuredImageOrigins().join(" ")}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${midtransApp} ${midtransApi}`,
    `frame-src 'self' ${midtransApp}`,
    `form-action 'self' ${midtransApp}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/security/csp-report",
    ...(isProduction && enforce ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function createCspResponseHeaders(nonce: string, isProduction = process.env.NODE_ENV === "production") {
  const reportOnlyPolicy = createContentSecurityPolicy(nonce, isProduction);
  const enforcementPolicy = createContentSecurityPolicy(nonce, isProduction, true);
  return {
    reportOnlyPolicy,
    enforcementPolicy,
    reportOnlyHeader: "Content-Security-Policy-Report-Only",
    enforce: process.env.CSP_ENFORCE === "true",
  };
}
