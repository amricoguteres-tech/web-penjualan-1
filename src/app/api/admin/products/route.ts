import { ProductStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/request-security";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { toCatalogProduct } from "@/lib/product-view";

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(140),
  description: z.string().trim().min(10).max(10_000),
  priceInIdr: z.number().int().min(1).max(1_000_000_000),
  compareAtPrice: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
  categoryId: z.string().min(1).max(64),
  imageUrl: z.union([
    z.string().url().max(2048).refine((value) => /^https:\/\//i.test(value)),
    z.string().regex(/^\/api\/media\/images\/[a-zA-Z0-9_-]{1,64}$/),
  ]).nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
}).strict();

export async function GET() {
  try {
    await requireAdmin();
    const products = await prisma.product.findMany({
      include: {
        category: { select: { id: true, name: true, slug: true } },
        digitalAsset: { select: { id: true, fileName: true, sizeBytes: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({
      products: products.map((product) => ({
        ...toCatalogProduct(product),
        status: product.status,
        digitalAsset: product.digitalAsset,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const data = productSchema.parse(await readJson(request));
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data,
        include: { category: { select: { id: true, name: true, slug: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "product.create",
          entityType: "Product",
          entityId: created.id,
          metadata: { slug: created.slug, status: created.status },
        },
      });
      return created;
    });
    return NextResponse.json({ product: toCatalogProduct(product) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
