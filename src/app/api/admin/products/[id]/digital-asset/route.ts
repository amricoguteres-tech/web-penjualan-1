import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { deletePrivateObject, putPrivateObject } from "@/lib/object-storage";
import { errorResponse, HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { validateDigitalAssetUpload } from "@/lib/upload-validation";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });
const MAX_FILE_BYTES = 50 * 1024 * 1024;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let uploadedKey: string | undefined;
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = paramsSchema.parse(await context.params);
    const rawContentLength = request.headers.get("content-length");
    const contentLength = Number(rawContentLength);
    if (!rawContentLength || !Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > MAX_FILE_BYTES + 64 * 1024) {
      throw new HttpError(413, "Digital asset upload is too large", "UPLOAD_TOO_LARGE");
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) {
      throw new HttpError(400, "A digital asset up to 50 MB is required", "INVALID_UPLOAD");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = validateDigitalAssetUpload(file.type, bytes);
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const prior = await prisma.productDigitalAsset.findUnique({ where: { productId: id } });
    uploadedKey = `products/${id}/digital/${randomUUID()}.${extension}`;
    const storageKey = uploadedKey;
    await putPrivateObject(storageKey, bytes, file.type);
    const asset = await prisma.$transaction(async (tx) => {
      const saved = await tx.productDigitalAsset.upsert({
        where: { productId: id },
        create: {
          productId: id,
          storageKey,
          fileName: file.name.slice(0, 180).replace(/[\r\n"]/g, "_"),
          contentType: file.type,
          sizeBytes: bytes.byteLength,
        },
        update: {
          storageKey,
          fileName: file.name.slice(0, 180).replace(/[\r\n"]/g, "_"),
          contentType: file.type,
          sizeBytes: bytes.byteLength,
        },
      });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "product.digital_asset.upload", entityType: "ProductDigitalAsset", entityId: saved.id },
      });
      return saved;
    });
    if (prior) {
      try {
        await deletePrivateObject(prior.storageKey);
      } catch {
        console.error("Failed to clean up a replaced digital asset.");
      }
    }
    return NextResponse.json({ asset: { id: asset.id, fileName: asset.fileName, sizeBytes: asset.sizeBytes } }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deletePrivateObject(uploadedKey);
      } catch {
        console.error("Failed to clean up an incomplete digital asset upload.");
      }
    }
    return errorResponse(error);
  }
}
