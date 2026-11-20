import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, readJson, HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const updateSchema = z.object({
  userId: z.string().min(1).max(64),
  disabled: z.boolean(),
}).strict();

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = z.coerce.number().int().min(1).max(1000).catch(1).parse(url.searchParams.get("page") ?? 1);
    const where = { role: "USER" as const };
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, role: true, disabled: true, createdAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
      prisma.user.count({ where }),
    ]);
    return NextResponse.json({ users, page, total, pages: Math.ceil(total / 50) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { userId, disabled } = updateSchema.parse(await readJson(request));
    if (admin.id === userId && disabled) throw new HttpError(400, "You cannot disable your own account", "SELF_DISABLE_FORBIDDEN");
    const updated = await prisma.$transaction(async (tx) => {
      const targetRole = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { role: true },
      });
      if (targetRole.role !== "USER" && admin.role !== "SUPER_ADMIN") {
        throw new HttpError(403, "Only a super administrator may manage administrator accounts", "ADMIN_ACCOUNT_PROTECTED");
      }
      const target = await tx.user.update({
        where: { id: userId },
        data: { disabled, authVersion: { increment: 1 } },
        select: { id: true, name: true, email: true, disabled: true, role: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: disabled ? "user.disable" : "user.enable",
          entityType: "User",
          entityId: userId,
        },
      });
      return target;
    });
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return errorResponse(new HttpError(404, "User not found", "USER_NOT_FOUND"));
    }
    return errorResponse(error);
  }
}
