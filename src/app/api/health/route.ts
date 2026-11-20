import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";
import { rateLimitProxyReady } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!rateLimitProxyReady()) {
    return NextResponse.json(
      { status: "unavailable", database: "not_checked", redis: "not_checked", rateLimitProxy: "not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.error("Health check failed: database probe did not succeed.");
    return NextResponse.json(
      { status: "unavailable", database: "unavailable", redis: process.env.REDIS_URL ? "not_checked" : "not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (process.env.REDIS_URL) {
    try {
      await (await getRedisClient()).ping();
    } catch {
      console.error("Health check failed: Redis probe did not succeed.");
      return NextResponse.json(
        { status: "unavailable", database: "connected", redis: "unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  return NextResponse.json({ status: "ok", database: "connected", redis: process.env.REDIS_URL ? "connected" : "not_configured", rateLimitProxy: "configured" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
