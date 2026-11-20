import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/catalog";
import AddToCartButton from "@/components/add-to-cart-button";
import ProductReviewForm from "@/components/product-review-form";
import AstronautGuide from "@/components/astronaut-guide";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function getProduct(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      reviews: {
        where: { approved: true },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: product.description.slice(0, 155),
    openGraph: {
      title: product.name,
      description: product.description.slice(0, 155),
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const averageRating = product.reviews.length
    ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
    : null;
  const outOfStock = product.stock !== null && product.stock < 1;

  return (
    <main className="product-detail-page">
      <header className="detail-header">
        <Link className="brand" href="/"><span className="brand-mark"><span>N</span></span><span>NEBULA <b>X</b></span></Link>
        <Link className="detail-back" href="/#marketplace"><ArrowLeft size={14} /> Back to marketplace</Link>
      </header>
      <AstronautGuide compact initialEvent={{ type: "USER_OPEN_PRODUCT", productName: product.name }} />
      <section className="product-detail-layout">
        <div className="detail-gallery">
          <div className="detail-main-image">
            {product.imageUrl && <Image className="detail-main-photo" src={product.imageUrl} alt={product.name} fill sizes="(max-width: 760px) 100vw, 55vw" unoptimized />}
            {!product.imageUrl && <div className="detail-art-fallback"><span className="detail-orbit detail-orbit-one" /><span className="detail-orbit detail-orbit-two" /><span className="detail-art-mark">NX</span></div>}
            <span className="detail-image-caption">NEBULA X / PRODUCT ARCHIVE</span>
          </div>
          {product.images.some((image) => image.storageKey.startsWith("/") || /^https:\/\//i.test(image.storageKey)) && <div className="detail-thumbnails">{product.images.filter((image) => image.storageKey.startsWith("/") || /^https:\/\//i.test(image.storageKey)).map((image) => <div key={image.id} className="detail-thumbnail"><Image src={image.storageKey} alt={image.altText ?? product.name} fill sizes="67px" unoptimized /></div>)}</div>}
        </div>
        <div className="detail-copy">
          <div className="eyebrow"><span className="section-index">{product.category.name.toUpperCase()}</span> / PRODUCT DETAIL</div>
          <h1>{product.name}</h1>
          {averageRating !== null && <div className="detail-rating"><span>★ {averageRating.toFixed(1)}</span> · {product.reviews.length} verified review{product.reviews.length === 1 ? "" : "s"}</div>}
          <p className="detail-description">{product.description}</p>
          <div className="detail-price"><span>Price</span><strong>{formatPrice(product.priceInIdr)}</strong>{product.compareAtPrice && product.compareAtPrice > product.priceInIdr && <del>{formatPrice(product.compareAtPrice)}</del>}</div>
          <div className="detail-stock"><span className={outOfStock ? "stock-off" : "stock-on"} />{outOfStock ? "Currently out of stock" : product.stock === null ? "Availability confirmed at checkout" : `${product.stock} in stock`}</div>
          <div className="detail-actions"><AddToCartButton productId={product.id} disabled={outOfStock} /><Link href="/#marketplace" className="button button-quiet">Continue exploring <ArrowUpRight size={14} /></Link></div>
          <div className="detail-assurance"><ShieldCheck size={16} /><span>Payments are created only at secure server-side checkout. The displayed price is revalidated against live inventory before an order is placed.</span></div>
          <div className="detail-features"><div><Check size={14} /> Live product data</div><div><Check size={14} /> Server-verified pricing</div><div><Check size={14} /> Secure provider checkout</div></div>
        </div>
      </section>
      <section className="detail-reviews">
        <div><div className="eyebrow"><span className="section-index">CUSTOMER NOTES</span></div><h2>Reviews from the universe.</h2></div>
        {product.reviews.length ? <div className="detail-review-list">{product.reviews.map((review) => <article key={review.id}><span>★ {review.rating} / 5</span><p>{review.body}</p><small>{review.user.name ?? "Verified customer"} · {review.createdAt.toLocaleDateString("id-ID")}</small></article>)}</div> : <p className="detail-empty">No approved reviews yet. Verified customer reviews will appear here.</p>}
        <ProductReviewForm slug={product.slug} />
      </section>
    </main>
  );
}
