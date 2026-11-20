"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Cloud,
  Code2,
  Cpu,
  Gamepad2,
  Globe2,
  Layers3,
  Menu,
  Minus,
  Plus,
  QrCode,
  Search,
  Server,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import AstronautGuide from "@/components/astronaut-guide";
import PlanetFallback from "@/components/planet-fallback";
import { emitAstronautEvent } from "@/lib/astronaut-events";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  formatPrice,
  type CatalogCategory,
  type CatalogProduct,
} from "@/lib/catalog";

const PlanetScene = dynamic(() => import("@/components/planet-scene"), {
  ssr: false,
  loading: () => <PlanetFallback />,
});

type CartLine = { product: CatalogProduct; quantity: number };
type PlatformStats = {
  customers: number;
  completedOrders: number;
  activeServices: number;
  availableProducts: number;
};
type CustomerStory = {
  id: string;
  rating: number;
  body: string;
  createdAt: string;
  user: { name: string | null };
  product: { name: string; slug: string };
};

const iconMap = {
  globe: Globe2,
  server: Server,
  cloud: Cloud,
  game: Gamepad2,
  code: Code2,
  app: Layers3,
};

const categoryCards = [
  {
    name: "Engineering Base",
    category: "Websites",
    description: "A launch point for websites and custom digital experiences.",
    icon: Globe2,
    tone: "violet",
    code: "01 / CREATE",
  },
  {
    name: "Technology Hub",
    category: "Applications",
    description: "Applications and software systems designed around real work.",
    icon: Layers3,
    tone: "blue",
    code: "02 / BUILD",
  },
  {
    name: "Infrastructure Station",
    category: "VPS",
    description: "Compute and hosting foundations for your next deployment.",
    icon: Server,
    tone: "cyan",
    code: "03 / COMPUTE",
  },
  {
    name: "Digital Planet",
    category: "Hosting",
    description: "A connected orbit of domains, hosting, and digital essentials.",
    icon: Cloud,
    tone: "blue",
    code: "04 / SCALE",
  },
  {
    name: "Gaming Galaxy",
    category: "Games",
    description: "Game services and digital goods for communities in motion.",
    icon: Gamepad2,
    tone: "violet",
    code: "05 / PLAY",
  },
  {
    name: "Resource Center",
    category: "Scripts & templates",
    description: "Scripts, templates, and reusable tools for your next build.",
    icon: Code2,
    tone: "silver",
    code: "06 / DISCOVER",
  },
];

const faqs = [
  {
    question: "What can I discover at NEBULA X?",
    answer:
      "The catalog displays active product listings from the NEBULA X database, including digital goods, websites, applications, hosting and software services. Listings appear after an administrator publishes them.",
  },
  {
    question: "Can I place an order or make a payment today?",
    answer:
      "Checkout requires an account and a configured Midtrans merchant integration. Product prices and stock are revalidated on the server before an order is submitted, and payment status is confirmed by a verified provider notification.",
  },
  {
    question: "Which payment method does NEBULA X accept?",
    answer:
      "Checkout currently accepts QRIS only through Midtrans Snap. You can scan the order-specific dynamic QR with DANA or another payment app that supports QRIS.",
  },
  {
    question: "When will customer stories and platform statistics appear?",
    answer:
      "Public metrics come from database counts. Customer stories appear only after a purchase-verified review has been approved by an administrator.",
  },
];

function IntroLoader() {
  const [visible, setVisible] = useState(false);
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.sessionStorage.getItem("nebula-intro-seen")) return;
    const showTimeout = window.setTimeout(() => {
      setVisible(true);
    }, 0);
    let timeline: gsap.core.Timeline | undefined;
    const finish = () => {
      window.sessionStorage.setItem("nebula-intro-seen", "true");
      setVisible(false);
    };
    const animationTimeout = window.setTimeout(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
      }
      if (!introRef.current) return;
      timeline = gsap.timeline({ onComplete: finish })
        .fromTo(".intro-nebula-planet", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "power3.out" })
        .fromTo(".intro-astronaut-mark", { x: 70, y: 30, opacity: 0, rotation: 12 }, { x: 0, y: 0, opacity: 1, rotation: 0, duration: 0.65, ease: "back.out(1.5)" }, "-=0.35")
        .fromTo(".intro-brand", { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, "-=0.2")
        .to(".intro-progress span", { scaleX: 1, duration: 0.55, ease: "power2.inOut" }, "-=0.1")
        .to(introRef.current, { opacity: 0, duration: 0.35, delay: 0.12, ease: "power2.in" });
    }, 20);
    return () => {
      window.clearTimeout(showTimeout);
      window.clearTimeout(animationTimeout);
      timeline?.kill();
    };
  }, []);

  if (!visible) return null;

  return (
    <div ref={introRef} className="intro-loader" role="status" aria-label="Entering the NEBULA X universe">
      <button className="intro-skip" type="button" onClick={() => {
        window.sessionStorage.setItem("nebula-intro-seen", "true");
        setVisible(false);
      }}>SKIP INTRO <ArrowUpRight size={12} /></button>
      <div className="loader-stars" />
      <div className="intro-universe-scene" aria-hidden="true">
        <div className="intro-nebula-planet"><i /><b /></div>
        <div className="intro-orbit" />
        <div className="intro-astronaut-mark"><i /><b /><span /></div>
      </div>
      <div className="intro-brand"><span className="brand-mark">N</span> NEBULA <span className="brand-x">X</span></div>
      <p>ENTERING THE DIGITAL FRONTIER</p>
      <div className="intro-progress"><span /></div>
    </div>
  );
}

function ProductCard({
  product,
  index,
  onAdd,
  onQuickView,
}: {
  product: CatalogProduct;
  index: number;
  onAdd: (product: CatalogProduct) => void;
  onQuickView: (product: CatalogProduct) => void;
}) {
  const Icon = iconMap[product.icon];

  return (
    <article className={`product-card product-card-${index % 3} accent-${product.accent} reveal`}>
      <button className="product-art" type="button" onClick={() => onQuickView(product)} aria-label={`Quick view ${product.name}`}>
        <div className="product-art-grid" />
        <div className="product-art-orbit orbit-a" />
        <div className="product-art-orbit orbit-b" />
        <div className="product-art-core"><Icon size={28} strokeWidth={1.3} /></div>
        <span className="product-label">{product.label}</span>
        <span className="product-art-index">NX / 0{index + 1}</span>
        <span className="quick-view-label">QUICK VIEW <ArrowUpRight size={12} /></span>
      </button>
      <div className="product-info">
        <div className="product-category">{product.category}</div>
        <h3><Link href={`/products/${encodeURIComponent(product.slug)}`} onClick={() => emitAstronautEvent({ type: "USER_OPEN_PRODUCT", productName: product.name })}>{product.name}</Link></h3>
        <p>{product.description}</p>
        <div className="product-bottom">
          <div className="product-price"><span>Starting at</span>{formatPrice(product.priceInIdr)}</div>
          <button
            className="icon-button add-button"
            type="button"
            aria-label={`Add ${product.name} to cart`}
            onClick={() => onAdd(product)}
            disabled={product.stock !== null && product.stock < 1}
            title={product.stock !== null && product.stock < 1 ? "Out of stock" : "Add to cart"}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function NebulaMarketplace() {
  const router = useRouter();
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [customerStories, setCustomerStories] = useState<CustomerStory[]>([]);
  const [statsUnavailable, setStatsUnavailable] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPages, setCatalogPages] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentMethodsError, setPaymentMethodsError] = useState(false);
  const [paymentRetry, setPaymentRetry] = useState(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [quickView, setQuickView] = useState<CatalogProduct | null>(null);
  const [activeSection, setActiveSection] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const checkoutKey = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/public/stats", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Live platform metrics are unavailable");
        return response.json();
      })
      .then((result: PlatformStats) => {
        setPlatformStats(result);
        setStatsUnavailable(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Live marketplace metrics are unavailable.", error);
        setStatsUnavailable(true);
      });
    void fetch("/api/public/reviews", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Approved customer reviews are unavailable");
        return response.json();
      })
      .then((result: { reviews: CustomerStory[] }) => setCustomerStories(result.reviews))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Approved customer reviews are unavailable.", error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });

    const sections = ["home", "universe", "marketplace", "technology", "about", "faq"];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      sections.forEach((id) => {
        const section = document.getElementById(id);
        if (!section) return;
        const activate = () => {
          setActiveSection(id);
          emitAstronautEvent({ type: "SECTION_CHANGED", section: id });
        };
        ScrollTrigger.create({
          trigger: section,
          start: "top center",
          end: "bottom center",
          onEnter: activate,
          onEnterBack: activate,
        });
      });

      if (!reducedMotion) {
        gsap.utils.toArray<HTMLElement>(".reveal").forEach((element) => {
          gsap.fromTo(
            element,
            { y: 30, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.8,
              ease: "power3.out",
              scrollTrigger: { trigger: element, start: "top 88%", once: true },
            },
          );
        });
        gsap.to(".hero-planet-wrap", {
          yPercent: 13,
          scale: 0.93,
          ease: "none",
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 0.7,
          },
        });
        gsap.to(".page-progress span", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: rootRef.current, start: "top top", end: "bottom bottom", scrub: true },
        });
      }
    }, rootRef);
    return () => {
      context.revert();
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCartOpen(false);
        setQuickView(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const parameters = new URLSearchParams({
          q: search,
          category: activeCategory,
          sort,
          page: String(catalogPage),
          limit: "48",
        });
        const [productResponse, categoryResponse] = await Promise.all([
          fetch(`/api/products?${parameters}`, { signal: controller.signal, cache: "no-store" }),
          fetch("/api/categories", { signal: controller.signal, cache: "no-store" }),
        ]);
        if (!productResponse.ok || !categoryResponse.ok) {
          throw new Error("The live marketplace catalog is currently unavailable.");
        }
        const [productData, categoryData] = await Promise.all([
          productResponse.json(),
          categoryResponse.json(),
        ]);
        const availableProducts = productData.products as CatalogProduct[];
        setProducts(availableProducts);
        setCatalogPages(productData.pages as number);
        setCategories(categoryData.categories as CatalogCategory[]);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Live marketplace data is unavailable.", error);
        setCatalogError(error instanceof Error ? error.message : "The marketplace catalog is unavailable.");
        setProducts([]);
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }
    void loadCatalog();
    return () => controller.abort();
  }, [activeCategory, catalogPage, search, sort, catalogRetry]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/payments/methods", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Payment methods could not be loaded");
        return response.json();
      })
      .then((result: { methods: string[] }) => {
        setPaymentMethods(result.methods);
        setPaymentMethodsError(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Configured payment methods are unavailable.", error);
        setPaymentMethods([]);
        setPaymentMethodsError(true);
      });
    return () => controller.abort();
  }, [paymentRetry]);

  useEffect(() => {
    const controller = new AbortController();
    let savedCart: { id: string; quantity: number }[] = [];
    try {
      const saved = localStorage.getItem("nebula-cart");
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) throw new Error("Saved cart data is invalid");
      savedCart = parsed.filter((item): item is { id: string; quantity: number } =>
        typeof item === "object" && item !== null &&
        typeof item.id === "string" && item.id.length <= 64 &&
        Number.isInteger(item.quantity) && item.quantity > 0,
      ).map(({ id, quantity }) => ({ id, quantity: Math.min(quantity, 10) }));
    } catch (error) {
      console.warn("Saved cart data could not be read.", error);
      savedCart = [];
    }
    if (!savedCart.length) return () => controller.abort();
    const productIds = [...new Set(savedCart.map(({ id }) => id))].slice(0, 20);
    void fetch(`/api/products?ids=${encodeURIComponent(productIds.join(","))}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Saved cart products could not be refreshed");
        return response.json();
      })
      .then((result: { products: CatalogProduct[] }) => {
        const productMap = new Map(result.products.map((product) => [product.id, product]));
        setCart(savedCart.flatMap(({ id, quantity }) => {
          const product = productMap.get(id);
          return product && Number.isInteger(quantity) && quantity > 0
            ? [{ product, quantity: Math.min(quantity, 10) }]
            : [];
        }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Products in the saved cart could not be refreshed.", error);
      });
    return () => controller.abort();
  }, []);

  const filteredProducts = useMemo(() => products, [products]);

  useEffect(() => {
    if (catalogLoading || catalogError || filteredProducts.length || activeSection !== "marketplace") return;
    emitAstronautEvent({ type: "USER_OPEN_EMPTY_STATE" });
  }, [activeSection, catalogError, catalogLoading, filteredProducts.length]);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + item.product.priceInIdr * item.quantity, 0);

  function persistCart(nextCart: CartLine[]) {
    setCart(nextCart);
    try {
      localStorage.setItem("nebula-cart", JSON.stringify(
        nextCart.map(({ product, quantity }) => ({ id: product.id, quantity })),
      ));
    } catch (error) {
      console.warn("Cart changes could not be persisted in this browser.", error);
    }
  }

  function addToCart(product: CatalogProduct) {
    const next = [...cart];
    const existing = next.find((item) => item.product.id === product.id);
    if (existing) existing.quantity = Math.min(10, existing.quantity + 1);
    else if (next.length < 20) next.push({ product, quantity: 1 });
    else {
      setCheckoutError("A checkout can include at most 20 different products.");
      setCartOpen(true);
      return;
    }

    persistCart(next);
    setQuickView(null);
    setCartOpen(true);
  }

  function openQuickView(product: CatalogProduct) {
    setQuickView(product);
    emitAstronautEvent({ type: "USER_OPEN_PRODUCT", productName: product.name });
  }

  function changeQuantity(productId: string, amount: number) {
    persistCart(cart
      .map((item) => item.product.id === productId ? { ...item, quantity: Math.min(10, item.quantity + amount) } : item)
      .filter((item) => item.quantity > 0));
  }

  function scrollToCatalog(category = "All") {
    const selected = categories.find((item) => item.name === category || item.slug === category);
    setActiveCategory(selected?.slug ?? (category === "All" ? "All" : category));
    setCatalogPage(1);
    if (/vps|hosting|infrastructure/i.test(category)) emitAstronautEvent({ type: "USER_OPEN_VPS" });
    else emitAstronautEvent({ type: "USER_OPEN_CATALOG" });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("marketplace")?.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
    });
  }

  async function beginCheckout() {
    emitAstronautEvent({ type: "USER_OPEN_CHECKOUT" });
    setCheckoutBusy(true);
    setCheckoutError("");
    const fingerprint = JSON.stringify({
      items: cart.map(({ product, quantity }) => [product.id, quantity]),
      couponCode: couponCode.trim().toUpperCase(),
    });
    if (checkoutKey.current?.fingerprint !== fingerprint) {
      checkoutKey.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": checkoutKey.current.key,
        },
        body: JSON.stringify({
          items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          ...(couponCode.trim() ? { couponCode: couponCode.trim().toUpperCase() } : {}),
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login?callbackUrl=%2F");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not start checkout.");
      if (typeof result.orderId !== "string" || !result.orderId) throw new Error("The order reference is missing.");
      try {
        localStorage.removeItem("nebula-cart");
      } catch (storageError) {
        console.warn("Local cart cleanup failed after checkout.", storageError);
      }
      checkoutKey.current = null;
      router.push(`/payments/${encodeURIComponent(result.orderId)}`);
    } catch (error) {
      emitAstronautEvent({ type: "USER_ERROR", message: error instanceof Error ? error.message : undefined });
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  const proofMetrics: { label: string; value: number | undefined }[] = [
    { label: "Customers", value: platformStats?.customers },
    { label: "Completed orders", value: platformStats?.completedOrders },
    { label: "Active services", value: platformStats?.activeServices },
    { label: "Available products", value: platformStats?.availableProducts },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <main ref={rootRef}>
      <IntroLoader />
      <div className="page-progress" aria-hidden="true"><span /></div>
      <div className="space-backdrop" aria-hidden="true">
        <div className="backdrop-nebula nebula-one" />
        <div className="backdrop-nebula nebula-two" />
        <div className="backdrop-grid" />
        <div className="backdrop-stars" />
      </div>

      <header className={`site-header ${scrolled ? "header-scrolled" : ""}`}>
        <a className="brand" href="#home" aria-label="NEBULA X home" onClick={closeMobileMenu}>
          <span className="brand-mark"><span>N</span></span>
          <span>NEBULA <b>X</b></span>
        </a>
        <nav className={`main-nav ${mobileMenuOpen ? "nav-open" : ""}`} aria-label="Main navigation">
          {[
            ["home", "Home"],
            ["universe", "Universe"],
            ["marketplace", "Marketplace"],
            ["technology", "Technology"],
            ["about", "About"],
          ].map(([id, label]) => (
            <a key={id} className={activeSection === id ? "nav-active" : ""} href={`#${id}`} onClick={closeMobileMenu}>{label}</a>
          ))}
          <a className="mobile-cart-link" href="#cart" onClick={(event) => { event.preventDefault(); setCartOpen(true); closeMobileMenu(); }}>
            Your cart <span>{cartCount}</span>
          </a>
        </nav>
        <div className="header-actions">
          <button className="cart-trigger" type="button" onClick={() => setCartOpen(true)} aria-label={`Open cart, ${cartCount} items`}>
            <ShoppingBag size={16} /><span>Cart</span><b>{cartCount}</b>
          </button>
          <a className="button button-small button-primary header-cta" href="#marketplace">Enter marketplace <ArrowUpRight size={14} /></a>
          <button className="menu-toggle" type="button" aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <section ref={heroRef} className="hero section-wrap" id="home">
        <div className="hero-content">
          <div className="eyebrow hero-eyebrow"><span className="live-dot" /> A NEW FRONTIER FOR WHAT&apos;S NEXT</div>
          <h1>EXPLORE BEYOND<br />THE DIGITAL <span className="gradient-word">UNIVERSE.</span></h1>
          <p className="hero-description">
            Your gateway to premium digital products, technology, infrastructure, and extraordinary solutions.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#universe">Explore universe <ArrowUpRight size={15} /></a>
            <a className="button button-quiet" href="#marketplace"><span className="play-icon"><ArrowDown size={13} /></span> Discover products</a>
          </div>
          <div className="hero-signals">
            <span className="availability"><i /> THE FRONTIER IS OPEN</span>
            <span className="hero-signal-divider" />
            <span>JAKARTA <b>·</b> EVERYWHERE</span>
          </div>
        </div>
        <div className="hero-planet-wrap">
          <div className="hero-planet-aura" />
          <PlanetScene />
          <div className="hero-object-caption caption-top"><span>NX / ASTRO</span> FIELD GUIDE</div>
          <div className="hero-object-caption caption-bottom"><span>CLASS</span> EXPLORER UNIT</div>
          <div className="floating-tech tech-01"><span className="tech-square"><Cloud size={13} /></span><span>CLOUD SYSTEMS<small>BUILD WITHOUT LIMITS</small></span></div>
          <div className="floating-tech tech-02"><span className="tech-square"><Cpu size={13} /></span><span>ORBITAL COMPUTE<small>POWER FOR YOUR IDEAS</small></span></div>
          <div className="planet-coordinates">06° 12&apos; 08.4&quot; S <span>—</span> 106° 49&apos; 38.2&quot; E</div>
          <AstronautGuide />
        </div>
        <a className="hero-scroll" href="#universe"><span className="scroll-line" /> SCROLL TO EXPLORE <ArrowDown size={12} /></a>
        <div className="hero-index">01 <span>/</span> 06</div>
      </section>

      <section className="capability-ribbon" aria-label="Technology capabilities">
        <div className="ribbon-heading"><span className="live-dot" /> THE BUILDING BLOCKS OF TOMORROW</div>
        <div className="ribbon-track">
          <span><Globe2 /> DIGITAL EXPERIENCES</span><i />
          <span><Server /> CLOUD INFRASTRUCTURE</span><i />
          <span><Code2 /> SOFTWARE & TOOLS</span><i />
          <span><Gamepad2 /> GAME TECHNOLOGY</span><i />
        </div>
      </section>

      <section className="universe-section section-wrap section-spacing" id="universe">
        <div className="section-heading reveal">
          <div><div className="eyebrow"><span className="section-index">01 / THE UNIVERSE</span> ONE SPACE. MANY POSSIBILITIES.</div><h2>Find the orbit<br /><span className="muted-heading">that moves you.</span></h2></div>
          <p className="section-intro">Explore a growing universe of digital essentials. Every path leads somewhere new.</p>
        </div>
        <div className="category-grid">
          {categoryCards.map(({ name, category, description, icon: Icon, tone, code }) => (
            <button type="button" className={`category-card tone-${tone} reveal`} key={name} onClick={() => scrollToCatalog(category)}>
              <span className="category-code">{code}</span>
              <span className="category-visual"><span className="category-orbit" /><span className="category-orbit orbit-outer" /><Icon size={28} strokeWidth={1.25} /></span>
              <span className="category-copy"><b>{name}</b><span>{description}</span></span>
              <span className="category-explore">EXPLORE <ArrowUpRight size={13} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="marketplace section-wrap section-spacing" id="marketplace">
        <div className="section-heading reveal">
          <div><div className="eyebrow"><span className="section-index">02 / SELECTED FOR YOU</span> THE MARKETPLACE</div><h2>Made for your<br /><span className="muted-heading">next big move.</span></h2></div>
          <p className="section-intro">Explore live products and services available in the NEBULA X catalog.</p>
        </div>
        <div className="catalog-toolbar">
          <div className="category-list" role="group" aria-label="Filter by category">
            <button type="button" className={`category-chip ${activeCategory === "All" ? "category-active" : ""}`} onClick={() => { setActiveCategory("All"); setCatalogPage(1); }}>All discoveries</button>
            {categories.map((category) => (
              <button type="button" key={category.id} className={`category-chip ${activeCategory === category.slug ? "category-active" : ""}`} onClick={() => { setActiveCategory(category.slug); setCatalogPage(1); }}>
                {category.name}
              </button>
            ))}
          </div>
          <div className="catalog-controls">
            <label className="catalog-search"><Search size={15} /><input value={search} onChange={(event) => { setSearch(event.target.value); setCatalogPage(1); }} placeholder="Search the universe" aria-label="Search products" />
              {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setCatalogPage(1); }}><X size={13} /></button>}
            </label>
            <label className="sort-select"><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => { setSort(event.target.value); setCatalogPage(1); }}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><ChevronDown size={13} /></label>
          </div>
        </div>
        {catalogLoading ? (
          <div className="catalog-state" role="status"><span className="catalog-spinner" />Connecting to the live marketplace catalog…</div>
        ) : catalogError ? (
          <div className="catalog-state catalog-state-error" role="alert"><span>CATALOG CONNECTION FAILED</span><p>{catalogError}</p><button className="button button-quiet" type="button" onClick={() => setCatalogRetry((value) => value + 1)}>Retry catalog</button></div>
        ) : filteredProducts.length ? (
          <div className="product-grid">
            {filteredProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} onAdd={addToCart} onQuickView={openQuickView} />)}
          </div>
        ) : (
          <div className="empty-catalog"><Search size={22} /><h3>{categories.length ? "No matching discoveries." : "The marketplace is getting ready."}</h3><p>{categories.length ? "Try a different search or category." : "Published products will appear here when the catalog is configured."}</p>{categories.length > 0 && <button className="button button-quiet" type="button" onClick={() => { setSearch(""); setActiveCategory("All"); }}>Clear filters <X size={14} /></button>}</div>
        )}
        {!catalogLoading && !catalogError && catalogPages > 1 && <nav className="catalog-pagination" aria-label="Product pages"><button className="button button-quiet" type="button" disabled={catalogPage <= 1} onClick={() => setCatalogPage((page) => page - 1)}>Previous</button><span>PAGE {catalogPage} / {catalogPages}</span><button className="button button-quiet" type="button" disabled={catalogPage >= catalogPages} onClick={() => setCatalogPage((page) => page + 1)}>Next</button></nav>}
        <div className="catalog-note"><span className="note-marker">i</span> Products and availability are loaded from the live database. Checkout totals are recalculated by the server.</div>
      </section>

      <section className="technology-section" id="technology">
        <div className="section-wrap technology-layout">
          <div className="technology-copy reveal">
            <div className="eyebrow"><span className="section-index">03 / THE CONNECTIVE TISSUE</span> BEYOND THE SURFACE</div>
            <h2>One ecosystem.<br /><span className="muted-heading">Built to move.</span></h2>
            <p>Great technology is more than a collection of products. It is the connections between them: dependable infrastructure, considered software and room for every new idea to grow.</p>
            <a className="text-link" href="#marketplace">Explore the first building blocks <ArrowRight size={15} /></a>
            <div className="tech-readout"><span>01</span><i /><span>CONNECTED BY POSSIBILITY</span></div>
          </div>
          <div className="network-visual reveal" aria-label="Abstract illustration of connected digital services">
            <div className="network-grid" />
            <div className="network-rings"><i /><i /><i /></div>
            <div className="network-center"><span><Layers3 size={27} /></span><b>NEBULA<br />CORE</b></div>
            <div className="network-node node-cloud"><Cloud /><span>CLOUD</span></div>
            <div className="network-node node-code"><Code2 /><span>SOFTWARE</span></div>
            <div className="network-node node-compute"><Cpu /><span>COMPUTE</span></div>
            <div className="network-node node-world"><Globe2 /><span>WEB</span></div>
            <div className="network-beam beam-one" /><div className="network-beam beam-two" /><div className="network-beam beam-three" />
            <span className="network-coordinate">SYSTEM MAP / NX-01</span>
          </div>
        </div>
      </section>

      <section className="principles-band section-wrap">
        <div className="principles-intro reveal"><div className="eyebrow"><span className="section-index">04 / OUR PRINCIPLES</span> MADE FOR WHAT COMES NEXT</div><h2>Quiet confidence.<br /><span className="muted-heading">Serious possibility.</span></h2></div>
        <div className="principles-grid">
          <div className="principle reveal"><span>01 / PERFORMANCE</span><Zap size={19} /><h3>High performance</h3><p>Technology should remove friction, not add another layer.</p></div>
          <div className="principle reveal"><span>02 / TRUST</span><ShieldCheck size={19} /><h3>Security, by design</h3><p>Trust is earned through clear, careful systems and practices.</p></div>
          <div className="principle reveal"><span>03 / RELIABILITY</span><Server size={19} /><h3>Dependable foundations</h3><p>Infrastructure that gives your next idea somewhere to land.</p></div>
          <div className="principle reveal"><span>04 / PEOPLE</span><Sparkles size={19} /><h3>Human at heart</h3><p>Make powerful technology feel simpler and more accessible.</p></div>
        </div>
      </section>

      <section className="proof-section section-wrap">
        <div className="proof-heading reveal">
          <div className="eyebrow"><span className="section-index">05 / BUILT ON REAL SIGNALS</span> NO INVENTED NUMBERS</div>
          <h2>Proof, not promises.</h2>
          <p>Verified platform-wide counts, sourced directly from the marketplace database.</p>
        </div>
        <div className="proof-grid reveal">
          {proofMetrics.map(({ label, value }, index) => (
            <div className="proof-metric" key={label}><span>0{index + 1} / LIVE METRIC</span><b aria-label={`${label}: ${value === undefined ? "unavailable" : value}`}>{value === undefined ? "—" : new Intl.NumberFormat("id-ID").format(value)}</b><small>{label}<br />{statsUnavailable ? "Database unavailable" : "Verified database count"}</small></div>
          ))}
        </div>
        <div className="proof-status"><span className="status-pip" /> {statsUnavailable ? "LIVE PLATFORM DATA UNAVAILABLE" : platformStats ? "LIVE COUNTS / DATABASE VERIFIED" : "CONNECTING TO LIVE PLATFORM DATA"} <span>NO CUSTOMER OR SALES FIGURES ARE INVENTED</span></div>
      </section>

      <section className="stories-section section-wrap">
        <div className="stories-heading reveal"><div><div className="eyebrow"><span className="section-index">06 / CUSTOMER STORIES</span> WORDS FROM THE UNIVERSE</div><h2>Stories worth<br /><span className="muted-heading">sharing.</span></h2></div><div className="stories-count">01 <span>/</span> 01</div></div>
        {customerStories.length ? <div className="stories-grid reveal">{customerStories.map((story) => <article className="story-card" key={story.id}><span className="story-rating">{"★".repeat(story.rating)}{"☆".repeat(5 - story.rating)}</span><p>{story.body}</p><b>{story.user.name ?? "Verified customer"}</b><Link href={`/products/${encodeURIComponent(story.product.slug)}`}>{story.product.name} <ArrowUpRight size={12} /></Link></article>)}</div> : <div className="stories-empty reveal"><div className="story-mark">“</div><div><span className="eyebrow">CUSTOMER VOICES</span><h3>Every good story starts with a real experience.</h3><p>Verified reviews will appear here after customers can purchase and use live marketplace services. We don&apos;t publish placeholder testimonials.</p></div><span className="story-empty-stamp"><ShieldCheck size={15} /> VERIFIED STORIES ONLY</span></div>}
      </section>

      <section className="faq-section section-wrap" id="faq">
        <div className="faq-intro reveal"><div className="eyebrow"><span className="section-index">07 / THE DETAILS</span> GOOD TO KNOW</div><h2>Clear answers.<br /><span className="muted-heading">No cosmic fog.</span></h2>{supportEmail ? <a className="text-link" href={`mailto:${supportEmail}`}>Still curious? Talk to us <ArrowUpRight size={14} /></a> : <Link className="text-link" href="/login?callbackUrl=%2Fdashboard">Sign in to contact support <ArrowUpRight size={14} /></Link>}</div>
        <div className="faq-list reveal">{faqs.map((faq, index) => (
          <details className="faq-item" key={faq.question}>
            <summary><span className="faq-index">0{index + 1}</span><b>{faq.question}</b><span className="faq-toggle"><Plus size={16} /></span></summary>
            <p>{faq.answer}</p>
          </details>
        ))}</div>
      </section>

      <section className="closing-cta section-wrap">
        <div className="closing-scene" aria-hidden="true"><span /><i /><i /><i /></div>
        <div className="eyebrow reveal"><span className="live-dot" /> YOUR NEXT DIMENSION AWAITS</div>
        <h2 className="reveal">READY TO ENTER THE<br /><span className="gradient-word">NEXT DIGITAL ERA?</span></h2>
        <p className="reveal">The universe is still taking shape. Find your first building block.</p>
        <button className="button button-primary reveal" type="button" onClick={() => scrollToCatalog()}>Explore NEBULA X <ArrowUpRight size={15} /></button>
        <span className="closing-coordinate">NEBULA X / BUILT FOR WHAT&apos;S NEXT</span>
      </section>

      <footer className="site-footer section-wrap" id="about">
        <div className="footer-main">
          <div className="footer-brand-column"><a className="brand" href="#home"><span className="brand-mark"><span>N</span></span><span>NEBULA <b>X</b></span></a><p>A wider universe<br />for what you imagine next.</p><span className="footer-status"><span className="live-dot" /> THE FRONTIER IS OPEN</span></div>
          <div className="footer-links"><span className="footer-heading">EXPLORE</span><a href="#universe">The universe</a><a href="#marketplace">Marketplace</a><a href="#technology">Technology</a></div>
          <div className="footer-links"><span className="footer-heading">DISCOVER</span><a href="#marketplace">Web & applications</a><a href="#marketplace">Cloud & compute</a><a href="#marketplace">Digital products</a></div>
          <div className="footer-links"><span className="footer-heading">SAY HELLO</span>{supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail} <ArrowUpRight size={12} /></a> : <Link href="/login?callbackUrl=%2Fdashboard">Customer support <ArrowUpRight size={12} /></Link>}<span>Digital services / online</span><span className="footer-legal">Policies must be configured<br />before public transactions.</span></div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} NEBULA X. A universe of possibility.</span><span>BUILT WITH INTENTION <span className="footer-star">✳</span></span></div>
      </footer>

      {quickView && (
        <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickView(null); }}>
          <section className="quick-view-modal" role="dialog" aria-modal="true" aria-labelledby="quick-view-title">
            <button className="icon-button modal-close" type="button" aria-label="Close quick view" onClick={() => setQuickView(null)}><X size={18} /></button>
            <div className={`quick-view-art accent-${quickView.accent}`}>{(() => { const Icon = iconMap[quickView.icon]; return <Icon size={45} strokeWidth={1.15} />; })()}<span>NEBULA X / DIGITAL DISCOVERY</span></div>
            <div className="quick-view-copy"><span className="product-category">{quickView.category} / {quickView.label}</span><h2 id="quick-view-title">{quickView.name}</h2><p>{quickView.description}</p><div className="product-price"><span>Live catalog price</span>{formatPrice(quickView.priceInIdr)}</div><p className="quick-view-disclaimer">The server verifies the current price and stock again before an order is created.</p><Link className="button button-quiet" href={`/products/${encodeURIComponent(quickView.slug)}`} onClick={() => setQuickView(null)}>View product details <ArrowUpRight size={14} /></Link><button className="button button-primary" type="button" onClick={() => addToCart(quickView)} disabled={quickView.stock !== null && quickView.stock < 1}>Add to cart <Plus size={15} /></button></div>
          </section>
        </div>
      )}

      {cartOpen && <div className="drawer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
        <aside className="cart-drawer" id="cart" aria-label="Shopping cart">
          <div className="drawer-heading"><div><span className="eyebrow"><span className="section-index">YOUR SELECTION</span></span><h2>Cart <span>({cartCount})</span></h2></div><button className="icon-button" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)}><X size={19} /></button></div>
          {cart.length ? <>
            <div className="cart-lines">{cart.map(({ product, quantity }) => {
              const Icon = iconMap[product.icon];
              return <div className="cart-line" key={product.id}><div className={`cart-line-icon accent-${product.accent}`}><Icon size={18} /></div><div className="cart-line-info"><h3>{product.name}</h3><span>{formatPrice(product.priceInIdr)}</span><div className="quantity-control"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}><Minus size={12} /></button><span>{quantity}</span><button type="button" aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)}><Plus size={12} /></button></div></div><b className="cart-line-total">{formatPrice(product.priceInIdr * quantity)}</b></div>;
            })}</div>
            <div className="cart-summary"><div><span>Estimated subtotal</span><b>{formatPrice(cartTotal)}</b></div><p>Final prices, stock and coupon eligibility are verified by the server before payment.</p>
              <label className="payment-method-select">COUPON CODE<input autoComplete="off" maxLength={40} value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Enter coupon code" /></label>
              <div className="qris-method-card"><span className="qris-method-icon"><QrCode size={18} /></span><span><b>QRIS</b><small>Dynamic QR through Midtrans Snap</small></span><i>ONLY</i></div>
              <p className="qris-method-note">Bayar menggunakan DANA atau aplikasi pembayaran lain yang mendukung QRIS.</p>
              {!paymentMethods.length && <div className="checkout-error" role="status">{paymentMethodsError ? "QRIS payment configuration could not be checked." : "Secure QRIS checkout is unavailable until Midtrans QRIS is configured."}{paymentMethodsError && <button className="payment-retry" type="button" onClick={() => setPaymentRetry((value) => value + 1)}>Retry</button>}</div>}
              {checkoutError && <div className="checkout-error" role="alert">{checkoutError}</div>}
              <button className="button button-primary checkout-button" type="button" onClick={beginCheckout} disabled={checkoutBusy || paymentMethods.length === 0}>{checkoutBusy ? "Starting secure checkout…" : <>Continue to secure checkout <ArrowRight size={15} /></>}</button>
            </div>
          </> : <div className="cart-empty"><ShoppingBag size={25} /><h3>Your universe is open.</h3><p>Add something to your cart to get started.</p><button className="button button-primary" type="button" onClick={() => setCartOpen(false)}>Explore the marketplace <ArrowRight size={15} /></button></div>}
        </aside>
      </div>}
    </main>
  );
}
