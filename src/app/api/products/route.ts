import { ProductStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { toCatalogProduct } from "@/lib/product-view";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  ids: z.string().max(1300).optional(),
  sort: z.enum(["featured", "price-low", "price-high"]).default("featured"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

export async function GET(request: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const productIds = query.ids?.split(",").filter(Boolean);
    if (productIds && (productIds.length > 20 || productIds.some((id) => id.length > 64))) {
      return NextResponse.json({ error: "Too many or invalid product IDs", code: "INVALID_PRODUCT_IDS" }, { status: 400 });
    }
    const where = {
      status: ProductStatus.ACTIVE,
      ...(productIds ? { id: { in: productIds } } : {}),
      ...(query.category && query.category !== "All"
        ? { category: { slug: query.category } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" as const } },
              { description: { contains: query.q, mode: "insensitive" as const } },
              { category: { name: { contains: query.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const orderBy =
      query.sort === "price-low"
        ? { priceInIdr: "asc" as const }
        : query.sort === "price-high"
          ? { priceInIdr: "desc" as const }
          : { createdAt: "desc" as const };

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      products: products.map(toCatalogProduct),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
