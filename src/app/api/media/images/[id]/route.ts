import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError } from "@/lib/http";
import { getPrivateObject } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const image = await prisma.productImage.findFirst({
      where: { id, product: { status: "ACTIVE" } },
      select: { storageKey: true, contentType: true },
    });
    if (!image) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
    const object = await getPrivateObject(image.storageKey);
    if (!object.Body) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
    return new NextResponse(object.Body.transformToWebStream(), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
