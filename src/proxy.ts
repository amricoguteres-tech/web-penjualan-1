import { NextResponse, type NextRequest } from "next/server";
import { createCspResponseHeaders, createCspNonce } from "@/lib/csp";

export function proxy(request: NextRequest) {
  const nonce = createCspNonce();
  const { reportOnlyPolicy, enforcementPolicy, enforce } = createCspResponseHeaders(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", enforce ? enforcementPolicy : reportOnlyPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy-Report-Only", reportOnlyPolicy);
  if (enforce) response.headers.set("Content-Security-Policy", enforcementPolicy);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
