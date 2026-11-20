import { CouponDiscountType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const createSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),
  discountType: z.nativeEnum(CouponDiscountType),
  discountValue: z.number().int().min(1),
  minimumOrderInIdr: z.number().int().min(0).max(1_000_000_000).default(0),
  maxUses: z.number().int().min(1).nullable().optional(),
  maxUsesPerUser: z.number().int().min(1).nullable().optional(),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(true),
}).strict().superRefine((data, context) => {
  if (data.discountType === "PERCENTAGE" && data.discountValue > 100) {
    context.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage discount cannot exceed 100" });
  }
  if (data.expiresAt && data.expiresAt <= data.startsAt) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after start" });
  }
});

export async function GET() {
  try {
    await requireAdmin();
    const coupons = await prisma.coupon.findMany({
      include: { _count: { select: { usages: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ coupons });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const data = createSchema.parse(await readJson(request));
    const coupon = await prisma.$transaction(async (tx) => {
      const created = await tx.coupon.create({ data });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "coupon.create", entityType: "Coupon", entityId: created.id },
      });
      return created;
    });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
