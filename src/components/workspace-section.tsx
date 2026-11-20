"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, LoaderCircle, RefreshCw, Shield } from "lucide-react";
import { formatPrice } from "@/lib/catalog";

type Row = Record<string, unknown> & { id?: string };
type UserWorkspace = {
  profile?: { id: string; name: string | null; email: string };
  orders?: unknown[];
  services?: unknown[];
  wallet?: { balanceInIdr: number; transactions: Row[] } | null;
  notifications?: unknown[];
  tickets?: unknown[];
};

const adminEndpoints: Record<string, { url: string; key: string }> = {
  Analytics: { url: "/api/admin/summary", key: "metrics" },
  Settings: { url: "/api/admin/summary", key: "systemStatus" },
  Products: { url: "/api/admin/products", key: "products" },
  Categories: { url: "/api/admin/categories", key: "categories" },
  Orders: { url: "/api/admin/orders", key: "orders" },
  Customers: { url: "/api/admin/users", key: "users" },
  Payments: { url: "/api/admin/payments", key: "payments" },
  "Email outbox": { url: "/api/admin/email-outbox", key: "jobs" },
  Invoices: { url: "/api/admin/invoices", key: "invoices" },
  Services: { url: "/api/admin/services", key: "services" },
  Support: { url: "/api/admin/tickets", key: "tickets" },
  Reviews: { url: "/api/admin/reviews", key: "reviews" },
  "Audit logs": { url: "/api/admin/audit-logs", key: "logs" },
  Coupons: { url: "/api/admin/coupons", key: "coupons" },
};

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function entityTitle(row: Row, section: string) {
  return text(row.name) || text(row.subject) || text(row.invoiceNumber) || text(row.action) ||
    text(row.code) || text(row.providerOrderId) || text(row.id) || section;
}

function entitySubtitle(row: Row) {
  const person = row.user && typeof row.user === "object" ? row.user as Row : null;
  const product = row.product && typeof row.product === "object" ? row.product as Row : null;
  const order = row.order && typeof row.order === "object" ? row.order as Row : null;
  const parts = [
    text(row.email) || text(person?.email),
    text(row.slug) || text(product?.name),
    text(row.status) || text(order?.status),
    row.createdAt ? new Date(String(row.createdAt)).toLocaleDateString("id-ID") : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function WorkspaceSection({
  mode,
  section,
  workspace,
}: {
  mode: "customer" | "admin";
  section: string;
  workspace: UserWorkspace | null;
}) {
  const [records, setRecords] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(mode === "admin");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [localWorkspace, setLocalWorkspace] = useState(workspace);
  const [categories, setCategories] = useState<Row[]>([]);
  const [profileName, setProfileName] = useState(workspace?.profile?.name ?? "");

  const config = adminEndpoints[section];
  useEffect(() => {
    if (mode !== "admin" || !config) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(config.url, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load management data");
        const value = result[config.key] as unknown;
        if (Array.isArray(value)) {
          setRecords(value as Row[]);
          setSummary(null);
        } else if (value && typeof value === "object") {
          setRecords([]);
          setSummary(value as Record<string, unknown>);
        } else {
          setRecords([]);
          setSummary(null);
        }
        setError("");
        if (section === "Products") {
          const categoryResponse = await fetch("/api/admin/categories", { cache: "no-store", signal: controller.signal });
          const categoryResult = await categoryResponse.json();
          if (!categoryResponse.ok) throw new Error(categoryResult.error ?? "Could not load product categories");
          setCategories(categoryResult.categories as Row[]);
        }
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        console.warn(`Admin ${section} data is unavailable.`, loadError);
        setError(loadError instanceof Error ? loadError.message : "Management data could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [config, mode, refresh, section]);

  const orderRows = (localWorkspace?.orders ?? []).filter((row): row is Row => typeof row === "object" && row !== null);
  const userRows = section === "My orders" || section === "Transactions" || section === "Invoices"
    ? section === "Invoices" ? orderRows.filter((row) => row.invoice) : orderRows
    : section === "My services"
      ? (localWorkspace?.services ?? []).filter((row): row is Row => typeof row === "object" && row !== null)
      : section === "Notifications"
        ? (localWorkspace?.notifications ?? []).filter((row): row is Row => typeof row === "object" && row !== null)
        : section === "Support"
          ? (localWorkspace?.tickets ?? []).filter((row): row is Row => typeof row === "object" && row !== null)
          : section === "Wallet"
            ? localWorkspace?.wallet?.transactions ?? []
            : [];
  const rows = mode === "admin" ? records : userRows;

  async function mutate(url: string, method: "PATCH" | "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The operation failed");
      setNotice("Changes saved.");
      if (mode === "admin") {
        setRefresh((value) => value + 1);
      } else {
        const freshResponse = await fetch("/api/me", { cache: "no-store" });
        const freshData = await freshResponse.json();
        if (!freshResponse.ok) throw new Error(freshData.error ?? "Saved, but the workspace could not be refreshed");
        setLocalWorkspace(freshData as UserWorkspace);
      }
      return true;
    } catch (actionError) {
      console.warn("Workspace action failed.", actionError);
      setError(actionError instanceof Error ? actionError.message : "The operation failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadProductFile(productId: string, file: File, kind: "images" | "digital-asset") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(`/api/admin/products/${productId}/${kind}`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The upload failed");
      setNotice("Product file uploaded.");
      setRefresh((value) => value + 1);
    } catch (uploadError) {
      console.warn("Product file upload failed.", uploadError);
      setError(uploadError instanceof Error ? uploadError.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    let created = false;
    if (section === "Products") {
      created = await mutate("/api/admin/products", "POST", {
        ...values,
        priceInIdr: Number(values.priceInIdr),
        categoryId: String(values.categoryId),
        status: "DRAFT",
      });
    } else if (section === "Categories") {
      created = await mutate("/api/admin/categories", "POST", values);
    } else if (section === "Coupons") {
      created = await mutate("/api/admin/coupons", "POST", {
        code: values.code,
        discountType: "PERCENTAGE",
        discountValue: Number(values.discountValue),
        minimumOrderInIdr: 0,
        startsAt: new Date().toISOString(),
        active: true,
      });
    }
    if (created) form.reset();
  }

  async function rowAction(row: Row) {
    if (!row.id) return;
    if (mode === "customer" && section === "Notifications") {
      await mutate("/api/me/notifications", "PATCH", { notificationId: row.id });
      return;
    }
    if (mode !== "admin") return;
    if (section === "Payments") {
      await mutate("/api/admin/payments/reconcile", "POST", {
        paymentId: row.id,
        reason: "Admin requested verification with the Midtrans status API.",
      });
      return;
    }
    if (section === "Products") {
      const status = row.status === "DRAFT" ? "ACTIVE" : row.status === "ACTIVE" ? "ARCHIVED" : "DRAFT";
      await mutate(`/api/admin/products/${row.id}`, "PATCH", { status });
    }
    else if (section === "Categories") await mutate(`/api/admin/categories/${row.id}`, "DELETE");
    else if (section === "Customers") await mutate("/api/admin/users", "PATCH", { userId: row.id, disabled: !row.disabled });
    else if (section === "Coupons") await mutate(`/api/admin/coupons/${row.id}`, "PATCH", { active: !row.active });
    else if (section === "Reviews") await mutate("/api/admin/reviews", "PATCH", { reviewId: row.id, approved: !row.approved });
    else if (section === "Orders" && (row.status === "PAID" || row.status === "PROCESSING")) {
      await mutate("/api/admin/orders", "PATCH", { orderId: row.id, status: row.status === "PAID" ? "PROCESSING" : "COMPLETED" });
    }
  }

  function actionLabel(row: Row) {
    if (mode === "customer" && section === "Notifications" && !row.readAt) return "Mark read";
    if (section === "Products") return row.status === "DRAFT" ? "Publish" : row.status === "ACTIVE" ? "Archive" : "Restore draft";
    if (section === "Categories") return "Delete";
    if (section === "Customers") return row.disabled ? "Enable" : "Disable";
    if (section === "Coupons") return row.active ? "Deactivate" : "Activate";
    if (section === "Reviews") return row.approved ? "Unpublish" : "Approve";
    if (section === "Payments" && row.status !== "SETTLEMENT" && row.status !== "REFUNDED") return "Reconcile";
    if (section === "Orders" && row.status === "PAID") return "Start fulfillment";
    if (section === "Orders" && row.status === "PROCESSING") return "Complete";
    return "";
  }

  return (
    <section className="workspace-section">
      <div className="workspace-section-heading">
        <div><span className="eyebrow"><span className="section-index">{mode === "admin" ? "ADMIN / LIVE DATA" : "ACCOUNT / PRIVATE DATA"}</span></span><h2>{section}</h2></div>
        {mode === "admin" && <button className="workspace-refresh" type="button" onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh section"><RefreshCw size={14} /></button>}
      </div>
      {section === "Settings" && mode === "customer" && workspace?.profile && <form className="workspace-form" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const name = String(formData.get("name") ?? "");
        if (await mutate("/api/me", "PATCH", { name })) setProfileName(name);
      }}><label>Display name<input name="name" value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={80} required /></label><label>Email address<input value={localWorkspace?.profile?.email ?? ""} disabled /></label><button className="button button-primary" disabled={busy}>Save profile</button></form>}
      {section === "Support" && mode === "customer" && <form className="workspace-form" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const created = await mutate("/api/me/support", "POST", { subject: formData.get("subject"), message: formData.get("message") });
        if (created) form.reset();
      }}><label>Ticket subject<input name="subject" minLength={4} maxLength={160} required /></label><label>How can we help?<textarea name="message" minLength={10} maxLength={5000} required /></label><button className="button button-primary" disabled={busy}>Create support ticket</button></form>}
      {mode === "admin" && ["Products", "Categories", "Coupons"].includes(section) && <form className="workspace-form workspace-create-form" onSubmit={createEntity}>
        {section === "Products" ? <>
          <label>Product name<input name="name" minLength={2} maxLength={120} required /></label>
          <label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
          <label>Description<input name="description" minLength={10} maxLength={10000} required /></label>
          <label>Price (IDR)<input name="priceInIdr" type="number" min={1} max={1000000000} required /></label>
          <label>Category<select name="categoryId" required defaultValue=""><option value="" disabled>Select a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{text(category.name)}</option>)}</select></label>
        </> : section === "Categories" ? <>
          <label>Category name<input name="name" minLength={2} maxLength={80} required /></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
        </> : <>
          <label>Coupon code<input name="code" minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" required /></label><label>Discount (%)<input name="discountValue" type="number" min={1} max={99} required /></label>
        </>}
        <button className="button button-quiet" disabled={busy}>{busy ? "Saving…" : `Create ${section.slice(0, -1).toLowerCase()}`}</button>
      </form>}
      {error && <div className="workspace-section-feedback workspace-feedback-error" role="alert">{error}</div>}
      {notice && <div className="workspace-section-feedback" role="status"><Check size={14} />{notice}</div>}
      {loading ? <div className="workspace-panel-state"><LoaderCircle className="auth-spinner" size={18} /> Loading verified records…</div>
        : error && !rows.length && !summary ? <div className="workspace-panel-state">{error}</div>
          : summary ? <div className="workspace-summary-grid">{Object.entries(summary).map(([key, value]) => <div key={key}><span>{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</span><b>{typeof value === "number" && key.toLowerCase().includes("idr") ? formatPrice(value) : String(value)}</b></div>)}</div>
            : rows.length ? <div className="workspace-record-list">{rows.map((row, index) => {
              const label = actionLabel(row);
              const invoice = row.invoice && typeof row.invoice === "object" ? row.invoice as Row : null;
              const amount = typeof row.totalInIdr === "number" ? row.totalInIdr : typeof row.amountInIdr === "number" ? row.amountInIdr : null;
              return <article className="workspace-record" key={text(row.id) || index}>
                <span className="workspace-record-icon"><Shield size={15} /></span>
                <div className="workspace-record-main">
                  <b>{entityTitle(row, section)}</b>
                  <small>{entitySubtitle(row) || JSON.stringify(row.body ?? row.description ?? row.type ?? "")}</small>
                  {section === "Invoices" && invoice?.id && <Link href={`/dashboard/invoices/${invoice.id}`}>Open invoice <ArrowUpRight size={12} /></Link>}
                  {section === "My orders" && Array.isArray(row.items) && <div className="workspace-order-products">{(row.items as Row[]).map((item, itemIndex) => {
                    const product = item.product && typeof item.product === "object" ? item.product as Row : null;
                    const asset = product?.digitalAsset && typeof product.digitalAsset === "object" ? product.digitalAsset as Row : null;
                    const payment = row.payment && typeof row.payment === "object" ? row.payment as Row : null;
                    const canDownload = row.status === "PAID" && payment?.status === "SETTLEMENT" && asset?.id;
                    return <div key={text(item.id) || `${text(product?.name)}-${itemIndex}`}>
                      <small>{text(product?.name)} × {text(item.quantity)}</small>
                      {canDownload && product?.id && <Link href={`/api/me/products/${product.id}/download`}>Download product <ArrowUpRight size={12} /></Link>}
                    </div>;
                  })}</div>}
                </div>
                {amount !== null && <strong>{formatPrice(amount)}</strong>}
                {label && <button className="workspace-row-action" type="button" disabled={busy} onClick={() => void rowAction(row)}>{label}</button>}
                {mode === "admin" && section === "Products" && row.id && <div className="product-file-actions">
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const file = new FormData(event.currentTarget).get("file");
                    if (file instanceof File) void uploadProductFile(text(row.id), file, "images");
                  }}><label>Image<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></label><button type="submit" disabled={busy}>Upload image</button></form>
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const file = new FormData(event.currentTarget).get("file");
                    if (file instanceof File) void uploadProductFile(text(row.id), file, "digital-asset");
                  }}><label>Digital asset<input name="file" type="file" accept=".zip,.pdf,application/zip,application/pdf" required /></label><button type="submit" disabled={busy}>Upload file</button></form>
                </div>}
                {mode === "admin" && section === "Support" && row.id && <form className="ticket-admin-reply" onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const values = new FormData(form);
                  const reply = String(values.get("reply") ?? "").trim();
                  const updated = await mutate("/api/admin/tickets", "PATCH", {
                    ticketId: row.id,
                    status: values.get("status"),
                    ...(reply ? { reply } : {}),
                  });
                  if (updated) form.reset();
                }}><select name="status" defaultValue={text(row.status)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="WAITING_FOR_CUSTOMER">Waiting for customer</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select><input name="reply" maxLength={5000} placeholder="Reply to customer (optional)" /><button type="submit" disabled={busy}>Update ticket</button></form>}
              </article>;
            })}</div>
              : <div className="workspace-panel-state">{mode === "admin" ? `No ${section.toLowerCase()} records exist yet.` : section === "Wallet" ? `Wallet balance: ${formatPrice(localWorkspace?.wallet?.balanceInIdr ?? 0)}. No wallet transactions.` : `No ${section.toLowerCase()} records to show yet.`}</div>}
      {section === "Wallet" && mode === "customer" && <div className="wallet-balance"><span>Current wallet balance</span><b>{formatPrice(localWorkspace?.wallet?.balanceInIdr ?? 0)}</b><small>Wallet top-ups are unavailable until a verified wallet payment flow is configured.</small></div>}
      {section === "Support" && mode === "customer" && <p className="workspace-panel-footnote">Support tickets are visible only to you and authorized support administrators.</p>}
      {mode === "admin" && <p className="workspace-panel-footnote">Changes are checked on the server and recorded in the audit log where applicable.</p>}
    </section>
  );
}
