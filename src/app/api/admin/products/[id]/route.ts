import { ProductStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { toCatalogProduct } from "@/lib/product-view";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(140).optional(),
  description: z.string().trim().min(10).max(10_000).optional(),
  priceInIdr: z.number().int().min(1).max(1_000_000_000).optional(),
  compareAtPrice: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
  categoryId: z.string().min(1).max(64).optional(),
  imageUrl: z.union([
    z.string().url().max(2048).refine((value) => /^https:\/\//i.test(value)),
    z.string().regex(/^\/api\/media\/images\/[a-zA-Z0-9_-]{1,64}$/),
  ]).nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
}).strict().refine((data) => Object.keys(data).length > 0);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = paramsSchema.parse(await context.params);
    const data = updateSchema.parse(await readJson(request));
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data,
        include: { category: { select: { id: true, name: true, slug: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "product.update",
          entityType: "Product",
          entityId: id,
          metadata: { changedFields: Object.keys(data) },
        },
      });
      return updated;
    });
    return NextResponse.json({ product: toCatalogProduct(product) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = paramsSchema.parse(await context.params);
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { status: ProductStatus.ARCHIVED } });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "product.archive", entityType: "Product", entityId: id },
      });
    });
    return NextResponse.json({ archived: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return errorResponse(new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND"));
    }
    return errorResponse(error);
  }
}
