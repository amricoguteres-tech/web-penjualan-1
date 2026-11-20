import { OrderStatus, PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(2000),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "product-review", limit: 10, windowMs: 60 * 60 * 1000 });
    const user = await requireUser();
    const { slug } = await context.params;
    const { rating, body } = reviewSchema.parse(await readJson(request));
    const purchase = await prisma.orderItem.findFirst({
      where: {
        product: { slug },
        order: {
          userId: user.id,
          status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.COMPLETED] },
          payment: { status: PaymentStatus.SETTLEMENT },
        },
      },
      select: { productId: true },
    });
    if (!purchase) throw new HttpError(403, "Only verified purchasers may review this product", "PURCHASE_REQUIRED");
    const review = await prisma.review.create({
      data: { userId: user.id, productId: purchase.productId, rating, body },
      select: { id: true, rating: true, body: true, approved: true, createdAt: true },
    });
    return NextResponse.json({ review, message: "Your review is awaiting moderation." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
