export const QRIS_PAYMENT_EXPIRY_MINUTES = 15;

export function createQrisSnapPayload(input: {
  orderId: string;
  amountInIdr: number;
  customerName: string;
  customerEmail: string;
  siteUrl: string;
  returnOrderId: string;
  startTime: Date;
}) {
  if (!Number.isSafeInteger(input.amountInIdr) || input.amountInIdr < 1) {
    throw new RangeError("QRIS payment amount must be a positive integer in IDR");
  }

  return {
    transaction_details: {
      order_id: input.orderId,
      gross_amount: input.amountInIdr,
    },
    item_details: [{
      id: input.orderId,
      price: input.amountInIdr,
      quantity: 1,
      name: `NEBULA X order ${input.orderId}`.slice(0, 50),
    }],
    customer_details: {
      first_name: input.customerName,
      email: input.customerEmail,
    },
    enabled_payments: ["qris"],
    expiry: {
      start_time: formatMidtransStartTime(input.startTime),
      unit: "minute",
      duration: QRIS_PAYMENT_EXPIRY_MINUTES,
    },
    callbacks: {
      finish: new URL(`/payments/${encodeURIComponent(input.returnOrderId)}`, input.siteUrl).toString(),
    },
  };
}

export function getQrisPaymentExpiry(createdAt: Date) {
  return new Date(createdAt.getTime() + QRIS_PAYMENT_EXPIRY_MINUTES * 60_000);
}

function formatMidtransStartTime(date: Date) {
  const jakartaTime = new Date(date.getTime() + 7 * 60 * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${jakartaTime.getUTCFullYear()}-${pad(jakartaTime.getUTCMonth() + 1)}-${pad(jakartaTime.getUTCDate())} ${pad(jakartaTime.getUTCHours())}:${pad(jakartaTime.getUTCMinutes())}:${pad(jakartaTime.getUTCSeconds())} +0700`;
}
