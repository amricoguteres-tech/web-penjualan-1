import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeCspReportLocation } from "@/lib/csp";
import { readJson } from "@/lib/http";

const reportSchema = z.object({
  "csp-report": z.object({
    "violated-directive": z.string().max(120).optional(),
    "effective-directive": z.string().max(120).optional(),
    "blocked-uri": z.string().max(512).optional(),
    "document-uri": z.string().max(512).optional(),
    "source-file": z.string().max(512).optional(),
    "line-number": z.number().int().nonnegative().optional(),
    "status-code": z.number().int().optional(),
  }).passthrough(),
}).passthrough();

export async function POST(request: Request) {
  try {
    const body = reportSchema.safeParse(await readJson(request, 8_192));
    if (!body.success) return new NextResponse(null, { status: 204 });
    const report = body.data["csp-report"];
    console.warn("CSP report-only violation", {
      directive: report["effective-directive"] ?? report["violated-directive"] ?? "unknown",
      blockedUri: sanitizeCspReportLocation(report["blocked-uri"]) ?? "unknown",
      sourceFile: sanitizeCspReportLocation(report["source-file"]),
      line: report["line-number"],
      statusCode: report["status-code"],
    });
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
}
