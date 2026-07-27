"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAdminView } from "@/components/AdminViewContext";
import { SalesBarChart, SalesPieChart } from "@/components/SalesCharts";
import { formatDate, formatMoney } from "@/lib/utils";

type Sale = {
  id: string;
  total: number;
  paymentMethod: "CASH" | "CARD";
  status: "COMPLETED" | "RETURNED";
  returnedAt: string | null;
  returnedByName: string | null;
  returnReason: string | null;
  createdAt: string;
  cashier: { name: string };
  items: Array<{
    id: string;
    quantity: number;
    lineTotal: number;
    product: { name: string; barcode: string | null };
  }>;
};

type Report = {
  from: string;
  to: string;
  salesTotal: number;
  returnsTotal: number;
  netTotal: number;
  salesCount: number;
  returnsCount: number;
  byCategory: Array<{
    category: string;
    categoryName: string;
    salesTotal: number;
    quantity: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    category: string;
    quantity: number;
    salesTotal: number;
  }>;
};

type SalesView = "report" | "history";

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export default function SalesPage() {
  const { t } = useLanguage();
  const { showAdminFeatures } = useAdminView();
  const [view, setView] = useState<SalesView>("report");
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "COMPLETED" | "RETURNED">("ALL");
  const [busyId, setBusyId] = useState("");
  const [reportFrom, setReportFrom] = useState(todayLocal());
  const [reportTo, setReportTo] = useState(todayLocal());
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!reportFrom || !reportTo || reportFrom > reportTo) {
      setReport(null);
      return;
    }

    let cancelled = false;
    async function loadReport() {
      setReportLoading(true);
      setError("");
      const params = new URLSearchParams({ from: reportFrom, to: reportTo });
      try {
        const res = await fetch(`/api/sales?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || t("reportLoadFailed"));
          setReport(null);
          return;
        }
        setReport(data.requestedReport);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("reportLoadFailed"));
          setReport(null);
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [reportFrom, reportTo, t]);

  useEffect(() => {
    if (view !== "history" || historyLoaded) return;

    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      setError("");
      try {
        const res = await fetch("/api/sales");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Failed to load sales");
          return;
        }
        setSales(data.sales);
        setHistoryLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sales");
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [view, historyLoaded]);

  const visibleSales = useMemo(
    () => sales.filter((sale) => filter === "ALL" || sale.status === filter),
    [filter, sales]
  );

  async function refreshHistory() {
    setHistoryLoading(true);
    setError("");
    const res = await fetch("/api/sales");
    const data = await res.json();
    setHistoryLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to load sales");
      return;
    }
    setSales(data.sales);
    setHistoryLoaded(true);
  }

  async function returnSale(sale: Sale) {
    if (!confirm("Return this entire sale? Its items will be added back to inventory.")) {
      return;
    }
    const reason = prompt("Return reason (optional):", "") ?? "";
    setBusyId(sale.id);
    setError("");
    const res = await fetch(`/api/sales/${sale.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    setBusyId("");
    if (!res.ok) {
      setError(data.error || "Failed to return sale");
      return;
    }
    setSales((current) =>
      current.map((item) => (item.id === sale.id ? data.sale : item))
    );
    await refreshHistory();
    if (reportFrom && reportTo) {
      const params = new URLSearchParams({ from: reportFrom, to: reportTo });
      const reportRes = await fetch(`/api/sales?${params.toString()}`);
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        setReport(reportData.requestedReport);
      }
    }
  }

  return (
    <div>
      <h1 className="page-title">{t("sales")}</h1>
      <p className="page-sub">{t("salesPageSubtitle")}</p>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="filters" style={{ marginBottom: "1rem" }}>
        <button
          className={`chip ${view === "report" ? "active" : ""}`}
          type="button"
          onClick={() => setView("report")}
        >
          {t("salesReport")}
        </button>
        <button
          className={`chip ${view === "history" ? "active" : ""}`}
          type="button"
          onClick={() => setView("history")}
        >
          {t("salesHistory")}
        </button>
      </div>

      {view === "report" ? (
        <>
          <section className="card report-request">
            <div>
              <h2 className="section-title">{t("salesReport")}</h2>
              <p className="page-sub">{t("reportTimelineSubtitle")}</p>
            </div>
            <div className="report-request-fields">
              <div className="field">
                <label className="label" htmlFor="report-from">{t("startDate")}</label>
                <input
                  className="input"
                  id="report-from"
                  type="date"
                  value={reportFrom}
                  max={reportTo || undefined}
                  onChange={(event) => setReportFrom(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="report-to">{t("endDate")}</label>
                <input
                  className="input"
                  id="report-to"
                  type="date"
                  value={reportTo}
                  min={reportFrom || undefined}
                  onChange={(event) => setReportTo(event.target.value)}
                />
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  const today = todayLocal();
                  setReportFrom(today);
                  setReportTo(today);
                }}
              >
                {t("today")}
              </button>
            </div>
          </section>

          <section aria-live="polite">
            {reportLoading ? (
              <div className="empty">{t("generating")}</div>
            ) : report ? (
              <>
                <div className="report-range-label">
                  {t("reportFor")} <strong>{report.from}</strong> — <strong>{report.to}</strong>
                </div>
                <div className="metric-grid sales-total-grid" style={{ marginBottom: "1rem" }}>
                  <div className="metric-card">
                    <div className="metric-label">{t("totalSales")}</div>
                    <div className="metric-value">{formatMoney(report.salesTotal)}</div>
                    <div className="report-count">{report.salesCount} {t("transactions")}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">{t("totalReturns")}</div>
                    <div className="metric-value" style={{ color: "var(--warn)" }}>
                      {formatMoney(report.returnsTotal)}
                    </div>
                    <div className="report-count">{report.returnsCount} {t("transactions")}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">{t("netSales")}</div>
                    <div className="metric-value">{formatMoney(report.netTotal)}</div>
                  </div>
                </div>

                <div className="split-2" style={{ marginBottom: "1rem" }}>
                  <section className="card" style={{ padding: "1rem" }}>
                    <h3 className="section-title" style={{ marginTop: 0 }}>
                      {t("salesByCategory")}
                    </h3>
                    <SalesPieChart
                      emptyLabel={t("noSalesInRange")}
                      slices={report.byCategory.map((row) => ({
                        label: row.categoryName,
                        value: row.salesTotal,
                      }))}
                    />
                    <div className="table-wrap" style={{ marginTop: "1rem" }}>
                      <table className="data">
                        <thead>
                          <tr>
                            <th>{t("category")}</th>
                            <th>{t("quantity")}</th>
                            <th>{t("totalSales")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.byCategory.map((row) => (
                            <tr key={row.category}>
                              <td data-label={t("category")}>{row.categoryName}</td>
                              <td data-label={t("quantity")}>{row.quantity}</td>
                              <td data-label={t("totalSales")}>{formatMoney(row.salesTotal)}</td>
                            </tr>
                          ))}
                          {report.byCategory.length === 0 && (
                            <tr>
                              <td colSpan={3} className="empty">
                                {t("noSalesInRange")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="card" style={{ padding: "1rem" }}>
                    <h3 className="section-title" style={{ marginTop: 0 }}>
                      {t("topSellingProducts")}
                    </h3>
                    <SalesBarChart
                      emptyLabel={t("noSalesInRange")}
                      formatValue={formatMoney}
                      bars={report.topProducts.map((row) => ({
                        label: row.name,
                        value: row.salesTotal,
                      }))}
                    />
                    <div className="table-wrap" style={{ marginTop: "1rem" }}>
                      <table className="data">
                        <thead>
                          <tr>
                            <th>{t("product")}</th>
                            <th>{t("quantity")}</th>
                            <th>{t("totalSales")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.topProducts.map((row) => (
                            <tr key={row.productId}>
                              <td data-label={t("product")}>
                                {row.name}
                                <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                                  {row.category}
                                </div>
                              </td>
                              <td data-label={t("quantity")}>{row.quantity}</td>
                              <td data-label={t("totalSales")}>{formatMoney(row.salesTotal)}</td>
                            </tr>
                          ))}
                          {report.topProducts.length === 0 && (
                            <tr>
                              <td colSpan={3} className="empty">
                                {t("noSalesInRange")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="empty">{t("selectReportDates")}</div>
            )}
          </section>
        </>
      ) : (
        <>
          <p className="page-sub">{t("completedSalesReturns")}</p>

          <div className="filters">
            {(["ALL", "COMPLETED", "RETURNED"] as const).map((value) => (
              <button
                key={value}
                className={`chip ${filter === value ? "active" : ""}`}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "ALL" ? t("all") : value === "COMPLETED" ? t("sales") : t("returns")}
              </button>
            ))}
          </div>

          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("date")}</th>
                  <th>{t("cashier")}</th>
                  <th>{t("items")}</th>
                  <th>{t("payment")}</th>
                  <th>{t("status")}</th>
                  <th>{t("total")}</th>
                  {showAdminFeatures && <th></th>}
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={showAdminFeatures ? 7 : 6} className="empty">
                      {t("loading")}
                    </td>
                  </tr>
                ) : visibleSales.length === 0 ? (
                  <tr>
                    <td colSpan={showAdminFeatures ? 7 : 6} className="empty">
                      No transactions in this view
                    </td>
                  </tr>
                ) : (
                  visibleSales.map((sale) => (
                    <tr key={sale.id}>
                      <td data-label={t("date")}>{formatDate(sale.createdAt)}</td>
                      <td data-label={t("cashier")}>{sale.cashier.name}</td>
                      <td data-label={t("items")}>
                        {sale.items.map((i) => `${i.product.name} ×${i.quantity}`).join(", ")}
                      </td>
                      <td data-label={t("payment")}>
                        <span className="badge badge-neutral">{sale.paymentMethod}</span>
                      </td>
                      <td data-label={t("status")}>
                        {sale.status === "RETURNED" ? (
                          <div>
                            <span className="badge badge-warn">{t("returned")}</span>
                            {sale.returnReason && (
                              <div style={{ marginTop: 5, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                                {sale.returnReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-ok">{t("completed")}</span>
                        )}
                      </td>
                      <td data-label={t("total")}>
                        {sale.status === "RETURNED" ? `-${formatMoney(sale.total)}` : formatMoney(sale.total)}
                      </td>
                      {showAdminFeatures && (
                        <td data-label="">
                          {sale.status !== "RETURNED" && (
                            <button
                              className="btn btn-danger"
                              disabled={busyId === sale.id}
                              onClick={() => returnSale(sale)}
                              type="button"
                            >
                              {busyId === sale.id ? `${t("returnSale")}…` : t("returnSale")}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
