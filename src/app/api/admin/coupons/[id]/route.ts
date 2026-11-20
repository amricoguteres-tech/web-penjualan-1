import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = paramsSchema.parse(await context.params);
    const schema = z.object({ active: z.boolean() }).strict();
    const { active } = schema.parse(await readJson(request));
    const coupon = await prisma.$transaction(async (tx) => {
      const updated = await tx.coupon.update({ where: { id }, data: { active } });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: active ? "coupon.activate" : "coupon.deactivate",
          entityType: "Coupon",
          entityId: id,
        },
      });
      return updated;
    });
    return NextResponse.json({ coupon });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return errorResponse(new HttpError(404, "Coupon not found", "COUPON_NOT_FOUND"));
    }
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
    const coupon = await prisma.$transaction(async (tx) => {
      const archived = await tx.coupon.update({ where: { id }, data: { active: false } });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "coupon.archive", entityType: "Coupon", entityId: id },
      });
      return archived;
    });
    return NextResponse.json({ coupon });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return errorResponse(new HttpError(404, "Coupon not found", "COUPON_NOT_FOUND"));
    }
    return errorResponse(error);
  }
}
