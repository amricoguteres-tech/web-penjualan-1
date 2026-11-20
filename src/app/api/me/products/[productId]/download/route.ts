import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";
import { getPurchasedDigitalAsset } from "@/lib/digital-download";
import { getPrivateObjectUrl } from "@/lib/object-storage";

const paramsSchema = z.object({ productId: z.string().min(1).max(64) });

export async function GET(_request: Request, context: { params: Promise<{ productId: string }> }) {
  try {
    const user = await requireUser();
    const { productId } = paramsSchema.parse(await context.params);
    const asset = await getPurchasedDigitalAsset(user.id, productId);
    const url = await getPrivateObjectUrl(asset.storageKey, asset.fileName, asset.contentType);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
