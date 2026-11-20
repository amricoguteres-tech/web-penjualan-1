import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { enqueueEmail } from "@/lib/email-outbox";
import { decideMidtransTransition } from "@/lib/midtrans-webhook";

type Transaction = Prisma.TransactionClient;

export async function applyPaymentTransition(
  tx: Transaction,
  input: {
    paymentId: string;
    nextStatus: PaymentStatus;
    paymentType?: string | null;
    transactionId: string;
    eventKey: string;
  },
) {
  const current = await tx.payment.findUniqueOrThrow({
    where: { id: input.paymentId },
    include: {
      order: {
        include: {
          items: true,
          invoice: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
  const transition = decideMidtransTransition(current.status, current.order.status, input.nextStatus);
  if (transition === "ignore") {
    return { outcome: "ignored" as const, paymentStatus: current.status, orderStatus: current.order.status };
  }

  const changed = await tx.payment.updateMany({
    where: { id: current.id, status: current.status },
    data: {
      status: input.nextStatus,
      paymentType: input.paymentType ?? current.paymentType,
    },
  });
  if (changed.count !== 1) {
    const latest = await tx.payment.findUniqueOrThrow({
      where: { id: current.id },
      select: { status: true, order: { select: { status: true } } },
    });
    return {
      outcome: "concurrent_change" as const,
      paymentStatus: latest.status,
      orderStatus: latest.order.status,
    };
  }

  let outcome: "applied" | "review_required" | "ignored" = "applied";
  if (transition === "settle" || transition === "reconcile") {
    const markedPaid = transition === "settle"
      ? await tx.order.updateMany({
        where: { id: current.orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.PAID },
      })
      : { count: 0 };
    if (markedPaid.count !== 1) {
      outcome = "review_required";
      await tx.auditLog.create({
        data: {
          action: "payment.settled_after_order_closed",
          entityType: "Payment",
          entityId: current.id,
          metadata: { orderId: current.orderId, transactionId: input.transactionId },
        },
      });
    } else if (current.order.invoice) {
      await tx.invoice.update({
        where: { id: current.order.invoice.id },
        data: { paidAt: new Date() },
      });
    }

    await tx.notification.create({
      data: {
        userId: current.order.userId,
        title: outcome === "applied" ? "Payment received" : "Payment needs review",
        body: outcome === "applied"
          ? `Payment for order ${current.orderId} has been confirmed.`
          : `Payment for closed order ${current.orderId} settled and requires support review.`,
      },
    });
    await enqueueEmail(tx, {
      to: current.order.user.email,
      subject: "NEBULA X payment update",
      text: `Hello ${current.order.user.name ?? "customer"}, the payment for order ${current.orderId} has settled. ${outcome === "applied" ? "Your order is paid." : "The order was already closed; contact support for reconciliation."} Check your dashboard for details.`,
    }, `payment:${current.id}:${input.eventKey}`);
  } else if (transition === "fail") {
    const cancelled = await tx.order.updateMany({
      where: { id: current.orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED },
    });
    if (cancelled.count === 1) {
      for (const item of current.order.items) {
        await tx.product.updateMany({
          where: { id: item.productId, stock: { not: null } },
          data: { stock: { increment: item.quantity } },
        });
      }
    } else {
      outcome = "review_required";
      await tx.auditLog.create({
        data: {
          action: "payment.failure_after_order_closed",
          entityType: "Payment",
          entityId: current.id,
          metadata: { orderId: current.orderId, transactionId: input.transactionId },
        },
      });
    }
    await tx.notification.create({
      data: {
        userId: current.order.userId,
        title: input.nextStatus === PaymentStatus.EXPIRED ? "Payment expired" : "Payment was not completed",
        body: `Payment for order ${current.orderId} is ${input.nextStatus.toLowerCase()}.`,
      },
    });
    await enqueueEmail(tx, {
      to: current.order.user.email,
      subject: "NEBULA X payment update",
      text: `Hello ${current.order.user.name ?? "customer"}, the payment for order ${current.orderId} is ${input.nextStatus.toLowerCase()}. Check your dashboard for details.`,
    }, `payment:${current.id}:${input.eventKey}`);
  }

  const latest = await tx.order.findUniqueOrThrow({
    where: { id: current.orderId },
    select: { status: true },
  });
  return {
    outcome,
    paymentStatus: input.nextStatus,
    orderStatus: latest.status,
  };
}
