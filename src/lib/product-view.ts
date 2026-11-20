import type { Product } from "@prisma/client";
import type { CatalogProduct } from "@/lib/catalog";

type ProductWithCategory = Product & {
  category: { id: string; name: string; slug: string };
};

const categoryStyle: Record<string, Pick<CatalogProduct, "icon" | "accent">> = {
  websites: { icon: "globe", accent: "blue" },
  applications: { icon: "app", accent: "cyan" },
  vps: { icon: "server", accent: "violet" },
  hosting: { icon: "cloud", accent: "cyan" },
  games: { icon: "game", accent: "pink" },
  "game-services": { icon: "game", accent: "pink" },
  scripts: { icon: "code", accent: "violet" },
  templates: { icon: "code", accent: "violet" },
  "digital-products": { icon: "code", accent: "blue" },
};

export function toCatalogProduct(product: ProductWithCategory): CatalogProduct {
  const style = categoryStyle[product.category.slug] ?? { icon: "code", accent: "violet" };
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: product.category.name,
    categoryId: product.category.id,
    categorySlug: product.category.slug,
    priceInIdr: product.priceInIdr,
    compareAtPrice: product.compareAtPrice,
    imageUrl: product.imageUrl,
    stock: product.stock,
    ...style,
    label: product.stock === 0 ? "Out of stock" : product.stock === null ? "Available" : `${product.stock} in stock`,
  };
}
