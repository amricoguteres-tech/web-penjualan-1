import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth-guards";
import { midtransBaseUrl } from "@/lib/midtrans-config";
import { prisma } from "@/lib/prisma";
import QrisPaymentPanel from "@/components/qris-payment-panel";

export const dynamic = "force-dynamic";

export default async function QrisPaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await requirePageUser();
  const { orderId } = await params;
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    select: {
      id: true,
      status: true,
      totalInIdr: true,
      payment: {
        select: {
          status: true,
          transactionToken: true,
          expiresAt: true,
          updatedAt: true,
        },
      },
      invoice: { select: { invoiceNumber: true } },
    },
  });
  if (!order?.payment) notFound();

  const requestHeaders = await headers();
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
  const snapBaseUrl = midtransBaseUrl();

  return (
    <main className="qris-payment-page">
      <div className="qris-payment-glow" aria-hidden="true" />
      <header className="qris-payment-header">
        <Link className="qris-brand" href="/">NEBULA <b>X</b></Link>
        <span><i /> SECURE CHECKOUT</span>
      </header>
      <QrisPaymentPanel
        orderId={order.id}
        invoiceNumber={order.invoice?.invoiceNumber ?? order.id}
        amountInIdr={order.totalInIdr}
        orderStatus={order.status}
        paymentStatus={order.payment.status}
        transactionToken={order.payment.status === "PENDING" && order.status === "PENDING"
          ? order.payment.transactionToken
          : null}
        expiresAt={order.payment.expiresAt?.toISOString() ?? null}
        updatedAt={order.payment.updatedAt.toISOString()}
        clientKey={clientKey}
        snapJsUrl={`${snapBaseUrl}/snap/snap.js`}
        nonce={requestHeaders.get("x-nonce") ?? undefined}
        initialNow={order.payment.updatedAt.getTime()}
      />
      <footer className="qris-payment-footer">
        <span>Payments securely processed by Midtrans</span>
        <Link href="/dashboard">Return to dashboard</Link>
      </footer>
    </main>
  );
}
