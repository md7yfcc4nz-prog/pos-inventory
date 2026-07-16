"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { categoryLabel, formatDate, formatMoney } from "@/lib/utils";

type DashboardData = {
  metrics: {
    totalSkus: number;
    totalUnits: number;
    inventoryValue: number;
    lowStockCount: number;
    expiredCount: number;
    nearExpiryCount: number;
  };
  lowStock: Array<{ id: string; name: string; quantity: number; lowStockThreshold: number }>;
  expired: Array<{ id: string; name: string; expiryDate: string; quantity: number }>;
  nearExpiry: Array<{ id: string; name: string; expiryDate: string; quantity: number }>;
  recent: Array<{
    id: string;
    name: string;
    category: "DRINKS" | "MEDICINE" | "OTHER";
    price: number;
    quantity: number;
    createdAt: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setData(json);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  if (!data) {
    return <div className="empty">Loading dashboard…</div>;
  }

  const { metrics } = data;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Store overview, stock health, and quick actions.</p>

      <div className="quick-actions" style={{ marginBottom: "1.2rem" }}>
        <Link className="btn btn-accent" href="/pos">
          New Sale
        </Link>
        <Link className="btn btn-primary" href="/inventory/new">
          Add Product
        </Link>
        <Link className="btn btn-secondary" href="/inventory?filter=low_stock">
          Low Stock
        </Link>
        <Link className="btn btn-secondary" href="/inventory?filter=expired">
          Expired
        </Link>
      </div>

      <div className="metric-grid" style={{ marginBottom: "1.2rem" }}>
        <div className="metric-card">
          <div className="metric-label">Total inventory (SKUs)</div>
          <div className="metric-value">{metrics.totalSkus}</div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>{metrics.totalUnits} units on hand</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Inventory value</div>
          <div className="metric-value">{formatMoney(metrics.inventoryValue)}</div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>Cost × quantity</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Low stock alerts</div>
          <div className="metric-value" style={{ color: "var(--warn)" }}>
            {metrics.lowStockCount}
          </div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>At or below threshold</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Expired medicine</div>
          <div className="metric-value" style={{ color: "var(--danger)" }}>
            {metrics.expiredCount}
          </div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>
            {metrics.nearExpiryCount} near expiry
          </div>
        </div>
      </div>

      {(data.expired.length > 0 || data.lowStock.length > 0) && (
        <div className="split-2" style={{ marginBottom: "1.2rem" }}>
          {data.expired.length > 0 && (
            <div className="alert alert-danger">
              <strong>Expired medicine:</strong>{" "}
              {data.expired.map((i) => i.name).join(", ")}
            </div>
          )}
          {data.lowStock.length > 0 && (
            <div className="alert alert-warn">
              <strong>Low stock:</strong>{" "}
              {data.lowStock.map((i) => `${i.name} (${i.quantity})`).join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="split-2">
        <section className="card">
          <div style={{ padding: "1rem 1.1rem", borderBottom: "1px solid var(--line)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Recently added</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/inventory/${item.id}`}>{item.name}</Link>
                      <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                        {formatDate(item.createdAt)}
                      </div>
                    </td>
                    <td>{categoryLabel(item.category)}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.price)}</td>
                  </tr>
                ))}
                {data.recent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No products yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div style={{ padding: "1rem 1.1rem", borderBottom: "1px solid var(--line)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Expiry watch</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Expiry</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {[...data.expired, ...data.nearExpiry].map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/inventory/${item.id}`}>{item.name}</Link>
                    </td>
                    <td>
                      <span className={data.expired.some((e) => e.id === item.id) ? "badge badge-danger" : "badge badge-warn"}>
                        {formatDate(item.expiryDate)}
                      </span>
                    </td>
                    <td>{item.quantity}</td>
                  </tr>
                ))}
                {data.expired.length === 0 && data.nearExpiry.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">
                      No expiry alerts
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
