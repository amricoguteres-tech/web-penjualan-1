import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const services = await prisma.service.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, status: true } },
        provider: { select: { id: true, name: true, active: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ services });
  } catch (error) {
    return errorResponse(error);
  }
}
