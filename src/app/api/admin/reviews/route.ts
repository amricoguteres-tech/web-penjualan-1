import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

export async function GET() {
  try {
    await requireAdmin();
    const reviews = await prisma.review.findMany({
      include: {
        user: { select: { name: true, email: true } },
        product: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ reviews });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { reviewId, approved } = z.object({
      reviewId: z.string().min(1).max(64),
      approved: z.boolean(),
    }).strict().parse(await readJson(request));
    const review = await prisma.$transaction(async (tx) => {
      const updated = await tx.review.update({ where: { id: reviewId }, data: { approved } });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: approved ? "review.approve" : "review.reject", entityType: "Review", entityId: reviewId },
      });
      return updated;
    });
    return NextResponse.json({ review });
  } catch (error) {
    return errorResponse(error);
  }
}
