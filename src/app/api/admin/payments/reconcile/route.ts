import { PaymentStatus, ReconciliationSource } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, readJson } from "@/lib/http";
import { reconcilePayment } from "@/lib/payment-reconciliation";
import { assertSameOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  paymentId: z.string().min(1).max(64),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = z.object({
      page: z.coerce.number().int().min(1).max(1000).default(1),
      status: z.nativeEnum(PaymentStatus).optional(),
    }).parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = {
      provider: "midtrans",
      ...(query.status ? { status: query.status } : {
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.EXPIRED] },
      }),
    };
    const [payments, total, recent] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        select: {
          id: true,
          providerOrderId: true,
          amountInIdr: true,
          status: true,
          updatedAt: true,
          order: { select: { id: true, status: true } },
          reconciliations: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "asc" },
        skip: (query.page - 1) * 50,
        take: 50,
      }),
      prisma.payment.count({ where }),
      prisma.paymentReconciliation.findMany({
        include: {
          payment: { select: { providerOrderId: true } },
          initiatedBy: { select: { email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return NextResponse.json({ payments, reconciliations: recent, page: query.page, total, pages: Math.ceil(total / 50) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const data = requestSchema.parse(await readJson(request));
    const result = await reconcilePayment({
      ...data,
      initiatedById: admin.id,
      source: ReconciliationSource.ADMIN,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
