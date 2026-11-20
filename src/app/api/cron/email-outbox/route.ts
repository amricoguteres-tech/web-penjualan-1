import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/http";
import { processEmailOutboxBatch, verifyWorkerSecret } from "@/lib/email-outbox";

export async function POST(request: Request) {
  try {
    if (!verifyWorkerSecret(request, "OUTBOX_WORKER_SECRET")) {
      throw new HttpError(401, "Worker authorization required", "UNAUTHORIZED_WORKER");
    }
    const processed = await processEmailOutboxBatch(10);
    return NextResponse.json({ processed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
