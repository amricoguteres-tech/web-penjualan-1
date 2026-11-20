import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/http";
import { getCachedJson, setCachedJson } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cached = await getCachedJson<{ reviews: unknown[] }>("public:reviews");
    if (cached) return NextResponse.json(cached, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
    const reviews = await prisma.review.findMany({
      where: { approved: true, product: { status: "ACTIVE" } },
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        user: { select: { name: true } },
        product: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    });
    const result = { reviews };
    await setCachedJson("public:reviews", result, 60);
    return NextResponse.json(
      result,
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
