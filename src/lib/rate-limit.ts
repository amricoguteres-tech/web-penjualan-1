import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { redisRateLimit } from "@/lib/redis";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  namespace: string;
};

export async function enforceRateLimit(
  request: Request,
  { limit, windowMs, namespace }: RateLimitOptions,
) {
  if (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY_HEADERS !== "true") {
    throw new HttpError(503, "Trusted proxy headers are required for production rate limiting", "RATE_LIMIT_PROXY_NOT_CONFIGURED");
  }
  const forwardedFor = process.env.TRUST_PROXY_HEADERS === "true"
    ? request.headers.get("x-forwarded-for")
    : null;
  const forwardedAddress = forwardedFor?.split(",")[0]?.trim() || "";
  const address = isIP(forwardedAddress) ? forwardedAddress : "untrusted-client";
  if (process.env.REDIS_URL) {
    const count = await redisRateLimit(namespace, address, windowMs);
    if (count > limit) {
      throw new HttpError(429, "Too many requests. Please try again later.", "RATE_LIMITED");
    }
    return;
  }
  const addressHash = createHash("sha256").update(address).digest("hex");
  const key = `${namespace}:${addressHash}`.slice(0, 190);
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "updatedAt")
    VALUES (${key}, ${windowStart}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" < ${windowStart} THEN ${windowStart}
        ELSE "RateLimitBucket"."windowStart"
      END,
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" < ${windowStart} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "updatedAt" = ${now}
    RETURNING "count"
  `;

  if ((rows[0]?.count ?? 0) > limit) {
    throw new HttpError(429, "Too many requests. Please try again later.", "RATE_LIMITED");
  }
}

export function rateLimitProxyReady() {
  return process.env.NODE_ENV !== "production" || process.env.TRUST_PROXY_HEADERS === "true";
}
