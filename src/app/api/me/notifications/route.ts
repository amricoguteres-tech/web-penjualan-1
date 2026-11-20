import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { notificationId } = z.object({ notificationId: z.string().min(1).max(64) }).strict().parse(await readJson(request));
    const updated = await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { readAt: new Date() },
    });
    if (updated.count !== 1) throw new HttpError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
    return NextResponse.json({ updated: true });
  } catch (error) {
    return errorResponse(error);
  }
}
