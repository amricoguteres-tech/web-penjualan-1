export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  categoryId: string;
  categorySlug: string;
  priceInIdr: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  stock: number | null;
  icon: "globe" | "server" | "cloud" | "game" | "code" | "app";
  accent: string;
  label: string;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
};

export function formatPrice(priceInIdr: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(priceInIdr);
}
