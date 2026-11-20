import { CouponDiscountType } from "@prisma/client";

export function calculateCouponDiscount(
  subtotal: number,
  discountType: CouponDiscountType,
  discountValue: number,
) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 1 ||
      !Number.isSafeInteger(discountValue) || discountValue < 1 ||
      (discountType === CouponDiscountType.PERCENTAGE && discountValue > 100)) {
    throw new RangeError("Invalid coupon calculation input");
  }
  return discountType === CouponDiscountType.PERCENTAGE
    ? Math.floor(subtotal * discountValue / 100)
    : Math.min(subtotal, discountValue);
}
