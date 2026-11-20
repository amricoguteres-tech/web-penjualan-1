import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
}).strict();

export async function GET() {
  try {
    const user = await requireUser();
    const [profile, orders, orderCount, services, activeServiceCount, wallet, notifications, tickets, spending, pendingPayments] = await prisma.$transaction([
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { id: true, name: true, email: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { userId: user.id },
        include: {
          items: { include: { product: { select: { id: true, name: true, slug: true, imageUrl: true } } } },
          payment: { select: { status: true, paymentType: true, updatedAt: true } },
          invoice: { select: { invoiceNumber: true, amountInIdr: true, issuedAt: true, paidAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.order.count({ where: { userId: user.id } }),
      prisma.service.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          orderId: true,
          providerServiceId: true,
          status: true,
          startsAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.service.count({ where: { userId: user.id, status: "ACTIVE" } }),
      prisma.wallet.findUnique({
        where: { userId: user.id },
        select: {
          balanceInIdr: true,
          transactions: { select: { id: true, type: true, amountInIdr: true, description: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 },
        },
      }),
      prisma.notification.findMany({
        where: { userId: user.id },
        select: { id: true, title: true, body: true, readAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.supportTicket.findMany({
        where: { userId: user.id },
        select: { id: true, subject: true, status: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      prisma.payment.aggregate({
        where: { status: "SETTLEMENT", order: { userId: user.id } },
        _sum: { amountInIdr: true },
      }),
      prisma.payment.count({ where: { status: "PENDING", order: { userId: user.id } } }),
    ]);
    return NextResponse.json({
      profile,
      metrics: {
        spendingInIdr: spending._sum.amountInIdr ?? 0,
        totalOrders: orderCount,
        pendingPayments,
        activeServices: activeServiceCount,
      },
      orders,
      services,
      wallet,
      notifications,
      tickets,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { name } = profileSchema.parse(await readJson(request));
    const profile = await prisma.user.update({
      where: { id: user.id },
      data: { name },
      select: { id: true, name: true, email: true },
    });
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
