import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/catalog";
import PrintInvoiceButton from "@/components/print-invoice-button";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requirePageUser();
  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, order: { userId: user.id } },
    include: {
      order: {
        include: {
          items: { include: { product: { select: { name: true } } } },
          payment: { select: { status: true, paymentType: true } },
        },
      },
    },
  });
  if (!invoice) notFound();

  return (
    <main className="invoice-page">
      <header><Link href="/dashboard">NEBULA X</Link><PrintInvoiceButton /></header>
      <section className="invoice-document">
        <div className="invoice-title"><div><span className="eyebrow">PAYMENT DOCUMENT</span><h1>Invoice</h1></div><b>{invoice.invoiceNumber}</b></div>
        <div className="invoice-parties"><div><span>ISSUED BY</span><b>NEBULA X</b><small>Digital marketplace</small></div><div><span>BILLED TO</span><b>{user.name ?? user.email}</b><small>{user.email}</small></div></div>
        <div className="invoice-status"><span>ORDER {invoice.orderId}</span><b>{invoice.order.payment?.status ?? invoice.order.status}</b></div>
        <div className="invoice-items">{invoice.order.items.map((item) => <div key={item.id}><span>{item.product.name} × {item.quantity}</span><b>{formatPrice(item.unitPriceInIdr * item.quantity)}</b></div>)}</div>
        <div className="invoice-total"><span>Total</span><b>{formatPrice(invoice.amountInIdr)}</b></div>
        <p className="invoice-footnote">{invoice.paidAt ? `Paid ${invoice.paidAt.toLocaleString("id-ID")}.` : "This invoice is not marked paid. Payment status is determined by the payment provider notification."}</p>
        <p className="invoice-footnote">Issued {invoice.issuedAt.toLocaleDateString("id-ID")} · NEBULA X digital order record</p>
      </section>
    </main>
  );
}
