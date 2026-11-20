import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/http";
import { reconcileStaleMidtransPayments } from "@/lib/payment-reconciliation";
import { verifyWorkerSecret } from "@/lib/email-outbox";

export async function POST(request: Request) {
  try {
    if (!verifyWorkerSecret(request, "PAYMENT_RECONCILIATION_SECRET")) {
      throw new HttpError(401, "Worker authorization required", "UNAUTHORIZED_WORKER");
    }
    const result = await reconcileStaleMidtransPayments(25);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
