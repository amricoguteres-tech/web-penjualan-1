import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });
const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).optional(),
}).strict().refine((data) => Object.keys(data).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = paramsSchema.parse(await context.params);
    const data = schema.parse(await readJson(request));
    const category = await prisma.$transaction(async (tx) => {
      const updated = await tx.productCategory.update({ where: { id }, data });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "category.update", entityType: "ProductCategory", entityId: id },
      });
      return updated;
    });
    return NextResponse.json({ category });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return errorResponse(new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND"));
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = paramsSchema.parse(await context.params);
    await prisma.$transaction(async (tx) => {
      await tx.productCategory.delete({ where: { id } });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "category.delete", entityType: "ProductCategory", entityId: id },
      });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return errorResponse(new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND"));
    }
    return errorResponse(error);
  }
}
