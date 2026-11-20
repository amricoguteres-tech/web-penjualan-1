"use client";

export default function PrintInvoiceButton() {
  return <button type="button" className="button button-quiet print-invoice" onClick={() => window.print()}>Print invoice</button>;
}
