import { createHash, timingSafeEqual } from "node:crypto";
import { OrderStatus, PaymentStatus } from "@prisma/client";

export type MidtransTransition =
  | "ignore"
  | "pending"
  | "settle"
  | "reconcile"
  | "fail";

export function createMidtransEventKey(
  orderId: string,
  transactionStatus: string,
  transactionId: string,
  statusCode: string,
) {
  return createHash("sha256")
    .update(`${orderId}:${transactionStatus}:${transactionId}:${statusCode}`)
    .digest("hex");
}

export function midtransAmountMatches(grossAmount: string, expectedAmount: number) {
  const amount = Number(grossAmount);
  return Number.isSafeInteger(amount) && amount === expectedAmount;
}

export function decideMidtransTransition(
  currentStatus: PaymentStatus,
  orderStatus: OrderStatus,
  nextStatus: PaymentStatus,
): MidtransTransition {
  if (currentStatus === PaymentStatus.SETTLEMENT || currentStatus === PaymentStatus.REFUNDED) return "ignore";
  if (nextStatus === PaymentStatus.PENDING || nextStatus === PaymentStatus.REFUNDED) return "ignore";
  if (
    (currentStatus === PaymentStatus.FAILED || currentStatus === PaymentStatus.EXPIRED) &&
    (nextStatus === PaymentStatus.FAILED || nextStatus === PaymentStatus.EXPIRED)
  ) return "ignore";
  if (nextStatus === PaymentStatus.SETTLEMENT) {
    return orderStatus === OrderStatus.PENDING ? "settle" : "reconcile";
  }
  if (nextStatus === PaymentStatus.FAILED || nextStatus === PaymentStatus.EXPIRED) return "fail";
  return "pending";
}

export function createMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
) {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

export function verifyMidtransSignature(
  signature: string,
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
) {
  if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(createMidtransSignature(orderId, statusCode, grossAmount, serverKey), "hex");
  const provided = Buffer.from(signature, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function mapMidtransPaymentStatus(
  status: string,
  fraudStatus?: string,
): PaymentStatus {
  if (status === "settlement" || (status === "capture" && fraudStatus === "accept")) {
    return PaymentStatus.SETTLEMENT;
  }
  if (status === "capture" && fraudStatus === "deny") return PaymentStatus.FAILED;
  if (status === "expire") return PaymentStatus.EXPIRED;
  if (status === "deny" || status === "cancel" || status === "failure") return PaymentStatus.FAILED;
  return PaymentStatus.PENDING;
}
