import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const [
      customers,
      orders,
      pendingOrders,
      activeServices,
      pendingPayments,
      revenue,
      products,
      recentOrders,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { role: "USER", disabled: false } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.service.count({ where: { status: "ACTIVE" } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
      prisma.payment.aggregate({ where: { status: "SETTLEMENT" }, _sum: { amountInIdr: true } }),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.order.findMany({
        include: {
          user: { select: { name: true, email: true } },
          items: { include: { product: { select: { name: true } } } },
          payment: { select: { status: true, paymentType: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return NextResponse.json({
      metrics: {
        customers,
        orders,
        pendingOrders,
        activeServices,
        pendingPayments,
        revenueInIdr: revenue._sum.amountInIdr ?? 0,
        availableProducts: products,
      },
      systemStatus: {
        database: "connected",
        authentication: "authenticated",
        paymentGateway: process.env.MIDTRANS_SERVER_KEY ? "configured" : "not_configured",
        email: process.env.EMAIL_SERVER ? "configured" : "not_configured",
        redis: process.env.REDIS_URL ? "configured_not_probed" : "not_configured",
        storage: process.env.S3_ENDPOINT ? "configured_not_probed" : "not_configured",
      },
      recentOrders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
