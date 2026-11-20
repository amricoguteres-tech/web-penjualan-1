import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "REQUEST_ERROR",
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Request validation failed", code: "VALIDATION_ERROR", details: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "A record with this value already exists", code: "CONFLICT" }, { status: 409 });
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "The requested record was not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (error.code === "P2003" || error.code === "P2014") {
      return NextResponse.json({ error: "This operation conflicts with related records", code: "RELATION_CONFLICT" }, { status: 409 });
    }
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json(
    { error: "An unexpected error occurred", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

export async function readJson(request: Request, maxBytes = 1_048_576) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new HttpError(413, "Request body is too large", "REQUEST_TOO_LARGE");
  }
  if (!request.body) throw new HttpError(400, "A valid JSON request body is required", "INVALID_JSON");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Request body is too large", "REQUEST_TOO_LARGE");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "A valid JSON request body is required", "INVALID_JSON");
  }
}
