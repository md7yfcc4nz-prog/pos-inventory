"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { cn, formatDate, formatMoney } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  category: "DRINKS" | "MEDICINE" | "OTHER";
  barcode: string | null;
  supplier: string | null;
  cost: number;
  price: number;
  quantity: number;
  lowStockThreshold: number;
  expiryDate: string | null;
  imagePath: string | null;
  lowStock: boolean;
  expired: boolean;
};

const FILTERS = [
  { key: "", labelKey: "all" },
  { key: "drinks", labelKey: "drinks" },
  { key: "medicine", labelKey: "medicine" },
  { key: "low_stock", labelKey: "lowStock" },
  { key: "expired", labelKey: "expired" },
];

function InventoryInner() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [supplier, setSupplier] = useState(searchParams.get("supplier") || "");
  const [filter, setFilter] = useState(searchParams.get("filter") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.supplier) set.add(p.supplier);
    });
    return Array.from(set).sort();
  }, [products]);

  async function load(next?: { q?: string; filter?: string; supplier?: string }) {
    setLoading(true);
    const params = new URLSearchParams();
    const query = next?.q ?? q;
    const f = next?.filter ?? filter;
    const s = next?.supplier ?? supplier;
    if (query) params.set("q", query);
    if (f) params.set("filter", f);
    if (s) params.set("supplier", s);
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to load inventory");
      return;
    }
    setProducts(data.products);
    setError("");
  }

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setIsAdmin(data.user?.role === "ADMIN"))
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilter(nextFilter: string) {
    setFilter(nextFilter);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextFilter) params.set("filter", nextFilter);
    if (supplier) params.set("supplier", supplier);
    router.replace(`/inventory?${params.toString()}`);
    load({ filter: nextFilter });
  }

  async function removeProduct(id: string) {
    if (!confirm("Delete this product?")) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete product");
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setError("");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">{t("inventory")}</h1>
          <p className="page-sub">{t("inventorySubtitle")}</p>
        </div>
        <Link className="btn btn-primary" href="/inventory/new">
          {t("addProduct")}
        </Link>
      </div>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            className={cn("chip", filter === f.key && "active")}
            onClick={() => applyFilter(f.key)}
            type="button"
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div className="split-3">
          <div className="field">
            <label className="label">{t("searchNameBarcode")}</label>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load({ q });
              }}
              placeholder="Search…"
            />
          </div>
          <div className="field">
            <label className="label">{t("supplier")}</label>
            <select
              className="select"
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                load({ supplier: e.target.value });
              }}
            >
              <option value="">{t("allSuppliers")}</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <label className="label">&nbsp;</label>
            <button className="btn btn-secondary" type="button" onClick={() => load()}>
              {t("search")}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t("product")}</th>
              <th>{t("category")}</th>
              <th>{t("barcode")}</th>
              <th>{t("supplier")}</th>
              <th>{t("quantity")}</th>
              <th>{t("price")}</th>
              <th>{t("expiry")}</th>
              <th>{t("status")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="empty">
                  {t("loading")}
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty">
                  {t("noProducts")}
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td data-label={t("product")}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {p.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagePath} alt="" className="product-thumb" />
                      ) : (
                        <div className="thumb-fallback">{p.name.slice(0, 2).toUpperCase()}</div>
                      )}
                      <Link href={`/inventory/${p.id}`}>{p.name}</Link>
                    </div>
                  </td>
                  <td data-label={t("category")}>{t(p.category === "DRINKS" ? "drinks" : p.category === "MEDICINE" ? "medicine" : "other")}</td>
                  <td data-label={t("barcode")}>{p.barcode || "—"}</td>
                  <td data-label={t("supplier")}>{p.supplier || "—"}</td>
                  <td data-label={t("quantity")}>{p.quantity}</td>
                  <td data-label={t("price")}>{formatMoney(p.price)}</td>
                  <td data-label={t("expiry")}>{formatDate(p.expiryDate)}</td>
                  <td data-label={t("status")}>
                    {p.expired ? (
                      <span className="badge badge-danger">{t("expired")}</span>
                    ) : p.lowStock ? (
                      <span className="badge badge-warn">{t("lowStock")}</span>
                    ) : (
                      <span className="badge badge-ok">{t("ok")}</span>
                    )}
                  </td>
                  <td data-label="">
                    <div style={{ display: "flex", gap: 8 }}>
                      <Link className="btn btn-secondary" href={`/inventory/${p.id}`}>
                        {t("edit")}
                      </Link>
                      {isAdmin && (
                        <button className="btn btn-danger" onClick={() => removeProduct(p.id)}>
                          {t("delete")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="empty">Loading inventory…</div>}>
      <InventoryInner />
    </Suspense>
  );
}
