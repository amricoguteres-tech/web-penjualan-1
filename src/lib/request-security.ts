import { HttpError } from "@/lib/http";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new HttpError(403, "A same-origin request is required", "INVALID_ORIGIN");

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new HttpError(403, "A valid same-origin request is required", "INVALID_ORIGIN");
  }

  const requestUrl = new URL(request.url);
  if (originUrl.origin !== requestUrl.origin) {
    throw new HttpError(403, "A same-origin request is required", "INVALID_ORIGIN");
  }
}
