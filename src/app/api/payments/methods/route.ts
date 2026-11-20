import { NextResponse } from "next/server";
import { getEnabledMidtransMethods } from "@/lib/midtrans-config";

export async function GET() {
  const methods = getEnabledMidtransMethods();

  return NextResponse.json({
    configured: methods.length === 1,
    environment: process.env.MIDTRANS_IS_PRODUCTION === "true" ? "production" : "sandbox",
    methods,
  });
}
