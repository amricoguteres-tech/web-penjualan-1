import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { deletePrivateObject, putPrivateObject } from "@/lib/object-storage";
import { validateImageUpload } from "@/lib/upload-validation";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let uploadedKey: string | undefined;
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = paramsSchema.parse(await context.params);
    const rawContentLength = request.headers.get("content-length");
    const contentLength = Number(rawContentLength);
    if (!rawContentLength || !Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > MAX_FILE_BYTES + 64 * 1024) {
      throw new HttpError(413, "Image upload is too large", "UPLOAD_TOO_LARGE");
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) {
      throw new HttpError(400, "A product image up to 5 MB is required", "INVALID_UPLOAD");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = validateImageUpload(file.type, bytes);
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const existing = await prisma.productImage.findFirst({
      where: { productId: id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (existing?.position ?? -1) + 1;
    uploadedKey = `products/${id}/images/${randomUUID()}.${extension}`;
    const storageKey = uploadedKey;
    await putPrivateObject(storageKey, bytes, file.type);

    const image = await prisma.$transaction(async (tx) => {
      const created = await tx.productImage.create({
        data: {
          productId: id,
          storageKey,
          contentType: file.type,
          altText: typeof formData.get("altText") === "string"
            ? String(formData.get("altText")).trim().slice(0, 200) || null
            : null,
          position,
        },
      });
      await tx.product.update({
        where: { id },
        data: { imageUrl: `/api/media/images/${created.id}` },
      });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "product.image.upload", entityType: "ProductImage", entityId: created.id },
      });
      return created;
    });
    return NextResponse.json({ image: { id: image.id, url: `/api/media/images/${image.id}`, position: image.position } }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deletePrivateObject(uploadedKey);
      } catch {
        console.error("Failed to clean up an incomplete product image upload.");
      }
    }
    return errorResponse(error);
  }
}
