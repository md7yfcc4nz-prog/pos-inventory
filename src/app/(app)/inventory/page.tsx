"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { categoryLabel, cn, formatDate, formatMoney } from "@/lib/utils";

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
  { key: "", label: "All" },
  { key: "drinks", label: "Drinks" },
  { key: "medicine", label: "Medicine" },
  { key: "low_stock", label: "Low stock" },
  { key: "expired", label: "Expired" },
];

function InventoryInner() {
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
          <h1 className="page-title">Inventory</h1>
          <p className="page-sub">Search, filter, and manage products for the active store.</p>
        </div>
        {isAdmin && (
          <Link className="btn btn-primary" href="/inventory/new">
            Add product
          </Link>
        )}
      </div>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            className={cn("chip", filter === f.key && "active")}
            onClick={() => applyFilter(f.key)}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div className="split-3">
          <div className="field">
            <label className="label">Search name or barcode</label>
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
            <label className="label">Supplier</label>
            <select
              className="select"
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                load({ supplier: e.target.value });
              }}
            >
              <option value="">All suppliers</option>
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
              Search
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Barcode</th>
              <th>Supplier</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Expiry</th>
              <th>Status</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="empty">
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="empty">
                  No products match your filters
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {p.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagePath} alt="" className="product-thumb" />
                      ) : (
                        <div className="thumb-fallback">{p.name.slice(0, 2).toUpperCase()}</div>
                      )}
                      {isAdmin ? (
                        <Link href={`/inventory/${p.id}`}>{p.name}</Link>
                      ) : (
                        <span>{p.name}</span>
                      )}
                    </div>
                  </td>
                  <td>{categoryLabel(p.category)}</td>
                  <td>{p.barcode || "—"}</td>
                  <td>{p.supplier || "—"}</td>
                  <td>{p.quantity}</td>
                  <td>{formatMoney(p.price)}</td>
                  <td>{formatDate(p.expiryDate)}</td>
                  <td>
                    {p.expired ? (
                      <span className="badge badge-danger">Expired</span>
                    ) : p.lowStock ? (
                      <span className="badge badge-warn">Low stock</span>
                    ) : (
                      <span className="badge badge-ok">OK</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Link className="btn btn-secondary" href={`/inventory/${p.id}`}>
                          Edit
                        </Link>
                        <button className="btn btn-danger" onClick={() => removeProduct(p.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
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
