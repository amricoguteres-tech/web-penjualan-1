import { PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  status: z.nativeEnum(PaymentStatus).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = query.status ? { status: query.status } : {};
    const [payments, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        select: {
          id: true, provider: true, providerOrderId: true, amountInIdr: true, status: true,
          paymentType: true, createdAt: true, updatedAt: true,
          order: { select: { id: true, status: true, user: { select: { email: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * 50,
        take: 50,
      }),
      prisma.payment.count({ where }),
    ]);
    return NextResponse.json({ payments, page: query.page, total, pages: Math.ceil(total / 50) });
  } catch (error) {
    return errorResponse(error);
  }
}
