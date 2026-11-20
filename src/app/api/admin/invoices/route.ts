import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const invoices = await prisma.invoice.findMany({
      include: {
        order: { select: { id: true, status: true, user: { select: { name: true, email: true } }, payment: { select: { status: true } } } },
      },
      orderBy: { issuedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ invoices });
  } catch (error) {
    return errorResponse(error);
  }
}
