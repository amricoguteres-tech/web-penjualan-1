import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const page = z.coerce.number().int().min(1).max(1000).catch(1)
      .parse(new URL(request.url).searchParams.get("page") ?? 1);
    const logs = await prisma.auditLog.findMany({
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 100,
      take: 100,
    });
    return NextResponse.json({ logs, page });
  } catch (error) {
    return errorResponse(error);
  }
}
