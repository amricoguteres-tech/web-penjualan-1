import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function getPurchasedDigitalAsset(userId: string, productId: string) {
  const asset = await prisma.productDigitalAsset.findFirst({
    where: {
      productId,
      product: {
        orderItems: {
          some: {
            productId,
            order: {
              userId,
              status: "PAID",
              payment: { status: "SETTLEMENT" },
            },
          },
        },
      },
    },
    select: { storageKey: true, fileName: true, contentType: true },
  });
  if (!asset) throw new HttpError(404, "Purchased digital asset not found", "ASSET_NOT_AVAILABLE");
  return asset;
}
