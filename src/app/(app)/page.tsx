"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatDate, formatMoney } from "@/lib/utils";

type DashboardData = {
  metrics: {
    totalSkus: number;
    totalUnits: number;
    inventoryValue: number;
    retailValue: number;
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
    category: string;
    price: number;
    quantity: number;
    createdAt: string;
    imagePath?: string | null;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    category: string;
    quantity: number;
    salesTotal: number;
  }>;
};

export default function DashboardPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [showTopProducts, setShowTopProducts] = useState(false);

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
      <h1 className="page-title">{t("dashboard")}</h1>
      <p className="page-sub">{t("dashboardSubtitle")}</p>

      <div className="quick-actions" style={{ marginBottom: "1.2rem" }}>
        <Link className="btn btn-accent" href="/pos">
          {t("newSale")}
        </Link>
        <Link className="btn btn-primary" href="/inventory/new">
          {t("addProduct")}
        </Link>
        <Link className="btn btn-secondary" href="/inventory?filter=low_stock">
          {t("lowStock")}
        </Link>
        <Link className="btn btn-secondary" href="/inventory?filter=expired">
          {t("expired")}
        </Link>
      </div>

      <div className="metric-grid" style={{ marginBottom: "1.2rem" }}>
        <div className="metric-card">
          <div className="metric-label">{t("unitsOnHandLabel")}</div>
          <div className="metric-value">{metrics.totalUnits}</div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>{metrics.totalSkus} {t("productsCount")}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t("inventoryValue")}</div>
          <div className="metric-value">{formatMoney(metrics.inventoryValue)}</div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>{t("costTimesQuantity")}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t("retailValue")}</div>
          <div className="metric-value">{formatMoney(metrics.retailValue)}</div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>{t("retailValueNote")}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t("lowStockAlerts")}</div>
          <div className="metric-value" style={{ color: "var(--warn)" }}>
            {metrics.lowStockCount}
          </div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>{t("atBelowThreshold")}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t("expiredMedicine")}</div>
          <div className="metric-value" style={{ color: "var(--danger)" }}>
            {metrics.expiredCount}
          </div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>
            {metrics.nearExpiryCount} {t("nearExpiry")}
          </div>
        </div>
      </div>

      {data.expired.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: "1.2rem" }}>
          <strong>{t("expiredMedicine")}:</strong>{" "}
          {data.expired.map((i) => i.name).join(", ")}
        </div>
      )}

      <section className="card welcome-products" style={{ marginBottom: "1.2rem" }}>
        <div className="welcome-products-header">
          <h2>{t("recentlyAdded")}</h2>
        </div>
        {data.recent.length === 0 ? (
          <div className="empty">{t("noProductsYet")}</div>
        ) : (
          <div className="product-card-grid">
            {data.recent.map((item) => (
              <Link key={item.id} href={`/inventory/${item.id}`} className="product-welcome-card">
                {item.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imagePath} alt="" className="product-welcome-thumb" />
                ) : (
                  <div className="product-welcome-thumb product-welcome-thumb-fallback">
                    {item.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="product-welcome-body">
                  <strong>{item.name}</strong>
                  <span className="product-welcome-meta">{item.category}</span>
                  <span className="product-welcome-meta">{formatDate(item.createdAt)}</span>
                  <div className="product-welcome-stats">
                    <span>{item.quantity} {t("quantity").toLowerCase()}</span>
                    <span className="product-welcome-price">{formatMoney(item.price)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginBottom: "1.2rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowTopProducts((open) => !open)}
        >
          {showTopProducts ? t("hideTopSelling") : t("showTopSelling")}
        </button>
      </div>

      {showTopProducts && (
        <section className="card" style={{ marginBottom: "1.2rem" }}>
          <div style={{ padding: "1rem 1.1rem", borderBottom: "1px solid var(--line)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>{t("topSellingProducts")}</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("product")}</th>
                  <th>{t("quantity")}</th>
                  <th>{t("totalSales")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((item, index) => (
                  <tr key={item.productId}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label={t("product")}>
                      <Link href={`/inventory/${item.productId}`}>{item.name}</Link>
                      <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                        {item.category}
                      </div>
                    </td>
                    <td data-label={t("quantity")}>{item.quantity}</td>
                    <td data-label={t("totalSales")}>{formatMoney(item.salesTotal)}</td>
                  </tr>
                ))}
                {data.topProducts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      {t("noSalesYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="split-2">
        <section className="card">
          <div style={{ padding: "1rem 1.1rem", borderBottom: "1px solid var(--line)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>{t("expiryWatch")}</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("product")}</th>
                  <th>{t("expiry")}</th>
                  <th>{t("quantity")}</th>
                </tr>
              </thead>
              <tbody>
                {[...data.expired, ...data.nearExpiry].map((item) => (
                  <tr key={item.id}>
                    <td data-label={t("product")}>
                      <Link href={`/inventory/${item.id}`}>{item.name}</Link>
                    </td>
                    <td data-label={t("expiry")}>
                      <span className={data.expired.some((e) => e.id === item.id) ? "badge badge-danger" : "badge badge-warn"}>
                        {formatDate(item.expiryDate)}
                      </span>
                    </td>
                    <td data-label={t("quantity")}>{item.quantity}</td>
                  </tr>
                ))}
                {data.expired.length === 0 && data.nearExpiry.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">
                      {t("noExpiryAlerts")}
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
