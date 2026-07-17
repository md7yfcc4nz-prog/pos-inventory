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
  const { t } = useLanguage();
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
          <div className="metric-label">{t("totalInventory")}</div>
          <div className="metric-value">{metrics.totalSkus}</div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>{metrics.totalUnits} {t("unitsOnHand")}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t("inventoryValue")}</div>
          <div className="metric-value">{formatMoney(metrics.inventoryValue)}</div>
          <div style={{ color: "var(--ink-muted)", marginTop: 4 }}>{t("costTimesQuantity")}</div>
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

      <div className="split-2">
        <section className="card">
          <div style={{ padding: "1rem 1.1rem", borderBottom: "1px solid var(--line)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>{t("recentlyAdded")}</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("product")}</th>
                  <th>{t("category")}</th>
                  <th>{t("quantity")}</th>
                  <th>{t("price")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((item) => (
                  <tr key={item.id}>
                    <td data-label={t("product")}>
                      <Link href={`/inventory/${item.id}`}>{item.name}</Link>
                      <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                        {formatDate(item.createdAt)}
                      </div>
                    </td>
                    <td data-label={t("category")}>{t(item.category === "DRINKS" ? "drinks" : item.category === "MEDICINE" ? "medicine" : "other")}</td>
                    <td data-label={t("quantity")}>{item.quantity}</td>
                    <td data-label={t("price")}>{formatMoney(item.price)}</td>
                  </tr>
                ))}
                {data.recent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      {t("noProductsYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

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
