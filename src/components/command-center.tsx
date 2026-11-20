"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  CircleHelp,
  Cloud,
  Command,
  CreditCard,
  Mail,
  FileText,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Package,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/catalog";
import WorkspaceSection from "@/components/workspace-section";
import AstronautGuide from "@/components/astronaut-guide";
import { emitAstronautEvent } from "@/lib/astronaut-events";

type CenterMode = "customer" | "admin";

const customerNav = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "My orders", icon: ShoppingBag },
  { label: "My services", icon: Cloud },
  { label: "Marketplace", icon: Package, href: "/#marketplace" },
  { label: "Wallet", icon: Wallet },
  { label: "Transactions", icon: CreditCard },
  { label: "Invoices", icon: FileText },
  { label: "Support", icon: LifeBuoy },
  { label: "Notifications", icon: Bell },
  { label: "Settings", icon: Settings },
];

const adminNav = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Analytics", icon: Activity },
  { label: "Products", icon: Package },
  { label: "Categories", icon: Command },
  { label: "Orders", icon: ShoppingBag },
  { label: "Customers", icon: Users },
  { label: "Payments", icon: CreditCard },
  { label: "Email outbox", icon: Mail },
  { label: "Invoices", icon: FileText },
  { label: "Coupons", icon: Sparkles },
  { label: "Services", icon: Cloud },
  { label: "Support", icon: LifeBuoy },
  { label: "Audit logs", icon: Shield },
  { label: "Settings", icon: Settings },
];

const customerMetrics = [
  { label: "Total spending", icon: Wallet, suffix: "ALL TIME" },
  { label: "Active services", icon: Cloud, suffix: "CURRENT" },
  { label: "Total orders", icon: ShoppingBag, suffix: "ALL TIME" },
  { label: "Pending payments", icon: CreditCard, suffix: "CURRENT" },
];

const adminMetrics = [
  { label: "Total revenue", icon: Wallet, suffix: "ALL TIME" },
  { label: "Total orders", icon: ShoppingBag, suffix: "ALL TIME" },
  { label: "Customers", icon: Users, suffix: "ALL TIME" },
  { label: "Active services", icon: Cloud, suffix: "CURRENT" },
];

type DashboardOrder = {
  id: string;
  status: string;
  totalInIdr: number;
  createdAt: string;
  user?: { name: string | null; email: string };
  items: { quantity: number; product: { name: string } }[];
  payment?: { status: string; paymentType?: string | null } | null;
};

type DashboardPayload = {
  profile?: { id: string; name: string | null; email: string };
  metrics: Record<string, number>;
  orders?: DashboardOrder[];
  recentOrders?: DashboardOrder[];
  services?: { id: string; status: string; expiresAt: string | null; providerServiceId: string | null }[];
  notifications?: { id: string; title: string; body: string; createdAt: string; readAt: string | null }[];
  systemStatus?: Record<string, string>;
};

export default function CommandCenter({ mode }: { mode: CenterMode }) {
  const isAdmin = mode === "admin";
  const [activeItem, setActiveItem] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [dataError, setDataError] = useState("");
  const [loading, setLoading] = useState(true);
  const nav = isAdmin ? adminNav : customerNav;
  const metrics = isAdmin ? adminMetrics : customerMetrics;
  const activeTitle = activeItem === "Overview" ? (isAdmin ? "Command overview" : "Your command center") : activeItem;

  useEffect(() => {
    const controller = new AbortController();
    async function loadDashboard() {
      try {
        const response = await fetch(isAdmin ? "/api/admin/summary" : "/api/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load workspace data");
        setData(result as DashboardPayload);
        setDataError("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Command center data is unavailable.", error);
        setDataError(error instanceof Error ? error.message : "Workspace data could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadDashboard();
    return () => controller.abort();
  }, [isAdmin]);

  function activate(label: string) {
    setActiveItem(label);
    setSidebarOpen(false);
    setNotice("");
    if (label === "My orders" || label === "Transactions") emitAstronautEvent({ type: "USER_OPEN_CHECKOUT" });
    else emitAstronautEvent({ type: "SECTION_CHANGED", section: label.toLowerCase() });
  }

  const accountName = data?.profile?.name || data?.profile?.email || (isAdmin ? "Administrator" : "Account");
  const currentOrders = data?.recentOrders ?? data?.orders ?? [];
  const chartOrders = [...currentOrders].slice(0, 8).reverse();
  const maxOrderTotal = Math.max(1, ...chartOrders.map((order) => order.totalInIdr));
  const metricValues = isAdmin
    ? [data?.metrics.revenueInIdr ?? 0, data?.metrics.orders ?? 0, data?.metrics.customers ?? 0, data?.metrics.activeServices ?? 0]
    : [data?.metrics.spendingInIdr ?? 0, data?.metrics.activeServices ?? 0, data?.metrics.totalOrders ?? 0, data?.metrics.pendingPayments ?? 0];

  return (
    <main className="command-page">
      <aside className={`command-sidebar ${sidebarOpen ? "sidebar-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}>
        <div className="command-brand-row">
          <Link className="brand" href="/" aria-label="NEBULA X home"><span className="brand-mark"><span>N</span></span>{!collapsed && <span>NEBULA <b>X</b></span>}</Link>
          <button className="sidebar-collapse" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}><Menu size={16} /></button>
          <button className="sidebar-close" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={17} /></button>
        </div>
        <div className="workspace-label">{!collapsed && <><span>{isAdmin ? "CONTROL ROOM" : "YOUR WORKSPACE"}</span><ChevronDown size={12} /></>}</div>
        <nav className="command-nav" aria-label={isAdmin ? "Admin navigation" : "Account navigation"}>
          {!collapsed && <span className="nav-section-label">WORKSPACE</span>}
          {nav.map((item) => {
            const Icon = item.icon;
            const className = `command-nav-item ${activeItem === item.label ? "command-nav-active" : ""}`;
            return "href" in item && item.href
              ? <Link className={className} href={item.href} key={item.label} onClick={() => setSidebarOpen(false)}><Icon size={16} /><span>{item.label}</span></Link>
              : <button className={className} key={item.label} type="button" onClick={() => activate(item.label)} title={collapsed ? item.label : undefined}><Icon size={16} /><span>{item.label}</span>{item.label === "Notifications" && !collapsed && data?.notifications?.some((notification) => !notification.readAt) && <i className="nav-dot" />}</button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="command-nav-item" type="button" onClick={() => activate("Support")}><CircleHelp size={16} /><span>Help center</span></button>
          <button className="workspace-user" type="button" onClick={() => void signOut({ redirectTo: "/login" })}>
            <span className="user-avatar">NX</span>
            {!collapsed && <span className="user-label"><b>{accountName}</b><small>Sign out</small></span>}
            {!collapsed && <ChevronDown size={13} />}
          </button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <section className={`command-main ${collapsed ? "command-main-wide" : ""}`}>
        <header className="command-topbar">
          <div className="command-topbar-left">
            <button className="command-menu-button" type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
            <div className="breadcrumb"><span>NEBULA X</span><i>/</i><b>{isAdmin ? "Admin" : "Workspace"}</b></div>
          </div>
          <div className="command-topbar-actions">
            <label className="command-search"><Search size={15} /><input placeholder="Search not connected" aria-label="Search unavailable until account services are connected" disabled /></label>
            <button className="command-icon-button" type="button" aria-label="Notifications" onClick={() => activate("Notifications")}><Bell size={16} /></button>
            <button className="command-profile" type="button" onClick={() => void signOut({ redirectTo: "/login" })}><span className="user-avatar">NX</span><ChevronDown size={13} /></button>
          </div>
        </header>
        <div className="command-content">
          <div className="command-heading">
            <div><div className="eyebrow"><span className="live-dot" /> {isAdmin ? "NEBULA X / CONTROL ROOM" : "NEBULA X / PERSONAL SPACE"}</div><h1>{activeTitle}</h1><p>{isAdmin ? "Live operational metrics from the NEBULA X database." : "Your digital universe, gathered in one place."}</p></div>
            <div className="command-date"><span>LOCAL TIME</span><b>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date())}</b></div>
            {!isAdmin && <AstronautGuide compact />}
          </div>

          {(loading || dataError) && <div className={`workspace-notice ${dataError ? "workspace-error" : ""}`} role={dataError ? "alert" : "status"}><Shield size={16} /><div><b>{dataError ? "Workspace data unavailable" : "Connecting your workspace"}</b><span>{dataError ?? "Loading verified account and transaction data…"}</span></div><Sparkles size={16} /></div>}

          {activeItem !== "Overview" ? <WorkspaceSection mode={mode} section={activeItem} workspace={data} /> : <>
          <div className="metric-grid">
            {metrics.map(({ label, icon: Icon, suffix }, index) => <article className="command-metric" key={label}><div className="metric-top"><span>{label}</span><Icon size={16} /></div><div className="metric-value">{loading ? "…" : dataError ? "—" : index === 0 ? formatPrice(metricValues[index]) : new Intl.NumberFormat("id-ID").format(metricValues[index])}</div><div className="metric-foot"><span>{suffix}</span><small>{loading ? "Loading" : dataError ? "Unavailable" : "Database verified"}</small></div></article>)}
          </div>

          <div className="command-panels">
            <section className="command-panel analytics-panel">
              <div className="panel-heading"><div><span className="eyebrow">ACTIVITY / VERIFIED ORDERS</span><h2>Recent order values</h2></div><span className="panel-period">Latest {chartOrders.length} orders</span></div>
              <div className="chart-empty chart-real"><div className="chart-grid"><i /><i /><i /><i />
                {chartOrders.length ? <div className="chart-bars" role="img" aria-label="Recent order values from database records">{chartOrders.map((order) => <div className="chart-bar-slot" key={order.id}><span className="chart-bar" style={{ height: `${Math.max(8, order.totalInIdr / maxOrderTotal * 100)}%` }} title={`${formatPrice(order.totalInIdr)} · ${new Date(order.createdAt).toLocaleDateString("id-ID")}`} /><small>{new Date(order.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</small></div>)}</div> : <div className="chart-empty-message"><Gauge size={20} /><b>{loading ? "Loading recent orders" : dataError ? "Order data unavailable" : "No recent orders"}</b><span>{dataError ?? "Order values will appear here when recorded."}</span></div>}
              </div></div>
            </section>
            <section className="command-panel readiness-panel">
              <div className="panel-heading"><div><span className="eyebrow">PLATFORM READINESS</span><h2>Connected services</h2></div><span className="readiness-icon"><Activity size={17} /></span></div>
              <div className="readiness-list">
                {(isAdmin ? [
                  ["Database", data?.systemStatus?.database],
                  ["Authentication", data?.systemStatus?.authentication],
                  ["Payments", data?.systemStatus?.paymentGateway],
                  ["Notifications", data?.systemStatus?.email],
                ] : [
                  ["Database", data ? "connected" : "not_checked"],
                  ["Authentication", data?.profile ? "authenticated" : "not_checked"],
                  ["Payments", "not_checked"],
                  ["Notifications", "not_checked"],
                ]).map(([item, state]) => <div className="readiness-row" key={item}><span className={`readiness-indicator ${state === "connected" || state === "authenticated" || state === "configured" ? "indicator-active" : ""}`} /><span>{item}</span><b>{(state ?? "not_checked").replaceAll("_", " ").toUpperCase()}</b></div>)}
              </div>
              <span className="readiness-footnote">Configuration indicators are not external service health checks.</span>
            </section>
          </div>

          <div className="command-panels lower-panels">
            <section className="command-panel activity-panel">
              <div className="panel-heading"><div><span className="eyebrow">{isAdmin ? "LATEST OPERATIONS" : "YOUR LATEST ACTIVITY"}</span><h2>Recent activity</h2></div><button className="panel-link" type="button" onClick={() => activate(isAdmin ? "Orders" : "My orders")}>View all <ArrowUpRight size={13} /></button></div>
              {currentOrders.length ? <div className="recent-order-list">{currentOrders.slice(0, 5).map((order) => <div className="recent-order-row" key={order.id}><span className="recent-order-icon"><ShoppingBag size={14} /></span><span className="recent-order-main"><b>{order.items.map((item) => item.product.name).join(", ")}</b><small>{order.user?.email ?? new Date(order.createdAt).toLocaleDateString("id-ID")} · {order.status}</small></span><strong>{formatPrice(order.totalInIdr)}</strong></div>)}</div> : <div className="panel-empty"><span className="empty-icon"><Activity size={19} /></span><b>{loading ? "Loading activity…" : dataError ? "Activity unavailable" : "No activity to show"}</b><span>{dataError ?? "Real orders and updates will appear here when available."}</span></div>}
            </section>
            <section className="command-panel services-panel">
              <div className="panel-heading"><div><span className="eyebrow">{isAdmin ? "FULFILLMENT" : "YOUR INFRASTRUCTURE"}</span><h2>{isAdmin ? "Service operations" : "Active services"}</h2></div><button className="panel-link" type="button" onClick={() => activate(isAdmin ? "Services" : "My services")}>View all <ArrowUpRight size={13} /></button></div>
              {data?.services?.length ? <div className="service-status-list">{data.services.slice(0, 5).map((service) => <div className="readiness-row" key={service.id}><span className={`readiness-indicator ${service.status === "ACTIVE" ? "indicator-active" : ""}`} /><span>{service.providerServiceId ?? `Service ${service.id.slice(0, 8)}`}</span><b>{service.status}{service.expiresAt ? ` · EXP ${new Date(service.expiresAt).toLocaleDateString("id-ID")}` : ""}</b></div>)}</div> : <div className="panel-empty"><span className="empty-icon"><Cloud size={19} /></span><b>{loading ? "Loading services…" : dataError ? "Services unavailable" : "No active services"}</b><span>{dataError ?? "Provisioned services will appear here."}</span></div>}
            </section>
          </div>

          <section className="command-quick-actions">
            <div><span className="eyebrow">NEXT STEPS</span><h2>Where to from here?</h2></div>
            <div className="quick-action-list">
              <Link href="/#marketplace"><span><ShoppingBag size={16} /></span><b>Browse marketplace</b><ArrowUpRight size={14} /></Link>
              <button type="button" onClick={() => setNotice("Orders are unavailable until checkout and accounts are enabled.")}><span><ArrowDownRight size={16} /></span><b>{isAdmin ? "Review operations" : "Create an order"}</b><ArrowUpRight size={14} /></button>
              <Link href={isAdmin ? "/admin" : "/dashboard"} onClick={() => activate("Support")}><span><LifeBuoy size={16} /></span><b>Contact support</b><ArrowUpRight size={14} /></Link>
            </div>
          </section>
          </>}
          <footer className="command-footer"><span>© {new Date().getFullYear()} NEBULA X</span><span>{dataError ? "DATA CONNECTION ERROR" : "LIVE DATA / SERVER VERIFIED"}</span></footer>
        </div>
        {notice && <div className="command-toast" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={14} /></button></div>}
      </section>
    </main>
  );
}
