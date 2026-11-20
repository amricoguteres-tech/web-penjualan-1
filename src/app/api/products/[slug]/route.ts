import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { toCatalogProduct } from "@/lib/product-view";

const paramsSchema = z.object({ slug: z.string().min(1).max(160) });

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = paramsSchema.parse(await context.params);
    const product = await prisma.product.findFirst({
      where: { slug, status: "ACTIVE" },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { position: "asc" } },
        reviews: {
          where: { approved: true },
          select: { id: true, rating: true, body: true, createdAt: true, user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const rating =
      product.reviews.length > 0
        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
        : null;

    return NextResponse.json({
      product: {
        ...toCatalogProduct(product),
        images: product.images.map((image) => ({ url: image.storageKey, altText: image.altText })),
        reviews: product.reviews,
        rating,
        reviewCount: product.reviews.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
