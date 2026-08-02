"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAdminView } from "@/components/AdminViewContext";
import { SalesPieChart } from "@/components/SalesCharts";
import { formatDate, formatMoney } from "@/lib/utils";

type Sale = {
  id: string;
  total: number;
  paymentMethod: "CASH" | "CARD";
  status: "COMPLETED" | "RETURNED";
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
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

type EditForm = {
  paymentMethod: "CASH" | "CARD";
  soldAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  items: Array<{ id: string; quantity: number; name: string }>;
};

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function saleDateLocal(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return todayLocal();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
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
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

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

  async function refreshReportIfNeeded() {
    if (!reportFrom || !reportTo) return;
    const params = new URLSearchParams({ from: reportFrom, to: reportTo });
    const reportRes = await fetch(`/api/sales?${params.toString()}`);
    if (reportRes.ok) {
      const reportData = await reportRes.json();
      setReport(reportData.requestedReport);
    }
  }

  function openEditSale(sale: Sale) {
    setError("");
    setEditingSale(sale);
    setEditForm({
      paymentMethod: sale.paymentMethod,
      soldAt: saleDateLocal(sale.createdAt),
      customerName: sale.customerName || "",
      customerPhone: sale.customerPhone || "",
      customerEmail: sale.customerEmail || "",
      items: sale.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        name: item.product.name,
      })),
    });
  }

  function closeEditSale() {
    if (editSaving) return;
    setEditingSale(null);
    setEditForm(null);
  }

  async function saveEditSale(event: FormEvent) {
    event.preventDefault();
    if (!editingSale || !editForm) return;
    setEditSaving(true);
    setError("");
    const res = await fetch(`/api/sales/${editingSale.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: editForm.paymentMethod,
        soldAt: editForm.soldAt,
        customerName: editForm.customerName,
        customerPhone: editForm.customerPhone,
        customerEmail: editForm.customerEmail,
        items: editForm.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
        })),
      }),
    });
    const data = await res.json();
    setEditSaving(false);
    if (!res.ok) {
      setError(data.error || t("saleUpdateFailed"));
      return;
    }
    setSales((current) =>
      current.map((item) => (item.id === editingSale.id ? data.sale : item))
    );
    setEditingSale(null);
    setEditForm(null);
    await refreshHistory();
    await refreshReportIfNeeded();
  }

  async function deleteSale(sale: Sale) {
    const message =
      sale.status === "RETURNED" ? t("confirmDeleteReturnedSale") : t("confirmDeleteSale");
    if (!confirm(message)) {
      return;
    }
    setBusyId(`delete-${sale.id}`);
    setError("");
    const res = await fetch(`/api/sales/${sale.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyId("");
    if (!res.ok) {
      setError(data.error || t("saleDeleteFailed"));
      return;
    }
    setSales((current) => current.filter((item) => item.id !== sale.id));
    if (editingSale?.id === sale.id) {
      setEditingSale(null);
      setEditForm(null);
    }
    await refreshReportIfNeeded();
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
    await refreshReportIfNeeded();
  }

  async function sendReceipt(sale: Sale) {
    let email = sale.customerEmail || "";
    let phone = sale.customerPhone || "";
    let name = sale.customerName || "";

    if (!email && !phone) {
      name = prompt(t("customerName"), name || "") ?? name;
      phone = prompt(t("customerPhone"), phone || "") ?? phone;
      email = prompt(t("customerEmail"), email || "") ?? email;
      if (!email && !phone) {
        setError(t("noCustomerContact"));
        return;
      }
    }

    setBusyId(`receipt-${sale.id}`);
    setError("");
    const res = await fetch(`/api/sales/${sale.id}/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
        email: Boolean(email),
        sms: Boolean(phone),
      }),
    });
    const data = await res.json();
    setBusyId("");
    if (!res.ok) {
      setError(data.error || t("receiptSendFailed"));
      return;
    }
    if (data.sale) {
      setSales((current) =>
        current.map((item) => (item.id === sale.id ? { ...item, ...data.sale } : item))
      );
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
                    <SalesPieChart
                      emptyLabel={t("noSalesInRange")}
                      slices={report.topProducts.map((row) => ({
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
                  <th>{t("customer")}</th>
                  <th>{t("items")}</th>
                  <th>{t("payment")}</th>
                  <th>{t("status")}</th>
                  <th>{t("total")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      {t("loading")}
                    </td>
                  </tr>
                ) : visibleSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      No transactions in this view
                    </td>
                  </tr>
                ) : (
                  visibleSales.map((sale) => (
                    <tr key={sale.id}>
                      <td data-label={t("date")}>{formatDate(sale.createdAt)}</td>
                      <td data-label={t("cashier")}>{sale.cashier.name}</td>
                      <td data-label={t("customer")}>
                        {sale.customerName || sale.customerPhone || sale.customerEmail ? (
                          <div>
                            {sale.customerName && <div>{sale.customerName}</div>}
                            {sale.customerPhone && (
                              <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                                {sale.customerPhone}
                              </div>
                            )}
                            {sale.customerEmail && (
                              <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                                {sale.customerEmail}
                              </div>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
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
                      <td data-label="">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {sale.status !== "RETURNED" && (
                            <button
                              className="btn btn-secondary"
                              disabled={busyId === `receipt-${sale.id}`}
                              onClick={() => sendReceipt(sale)}
                              type="button"
                            >
                              {busyId === `receipt-${sale.id}` ? `${t("sendReceipt")}…` : t("sendReceipt")}
                            </button>
                          )}
                          {showAdminFeatures && sale.status === "COMPLETED" && (
                            <button
                              className="btn btn-secondary"
                              disabled={Boolean(busyId)}
                              onClick={() => openEditSale(sale)}
                              type="button"
                            >
                              {t("editSale")}
                            </button>
                          )}
                          {showAdminFeatures && sale.status === "COMPLETED" && (
                            <button
                              className="btn btn-danger"
                              disabled={busyId === sale.id}
                              onClick={() => returnSale(sale)}
                              type="button"
                            >
                              {busyId === sale.id ? `${t("returnSale")}…` : t("returnSale")}
                            </button>
                          )}
                          {showAdminFeatures && (
                            <button
                              className="btn btn-danger"
                              disabled={busyId === `delete-${sale.id}`}
                              onClick={() => deleteSale(sale)}
                              type="button"
                            >
                              {busyId === `delete-${sale.id}`
                                ? `${t("deleteSale")}…`
                                : t("deleteSale")}
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
        </>
      )}

      {editingSale && editForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-sale-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            background: "rgba(18, 24, 20, 0.45)",
          }}
          onClick={closeEditSale}
        >
          <form
            className="card"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveEditSale}
            style={{
              width: "min(520px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              padding: "1.2rem",
            }}
          >
            <h2 id="edit-sale-title" className="section-title" style={{ marginTop: 0 }}>
              {t("editingSale")}
            </h2>
            <p className="page-sub" style={{ marginTop: 0 }}>
              {formatMoney(editingSale.total)} · {formatDate(editingSale.createdAt)}
            </p>

            <div className="field" style={{ marginBottom: "0.85rem" }}>
              <label className="label" htmlFor="edit-sale-date">
                {t("saleDate")}
              </label>
              <input
                className="input"
                id="edit-sale-date"
                type="date"
                required
                max={todayLocal()}
                value={editForm.soldAt}
                onChange={(event) =>
                  setEditForm((current) =>
                    current ? { ...current, soldAt: event.target.value } : current
                  )
                }
              />
            </div>

            <div className="field" style={{ marginBottom: "0.85rem" }}>
              <label className="label" htmlFor="edit-sale-payment">
                {t("payment")}
              </label>
              <select
                className="input"
                id="edit-sale-payment"
                value={editForm.paymentMethod}
                onChange={(event) =>
                  setEditForm((current) =>
                    current
                      ? {
                          ...current,
                          paymentMethod: event.target.value as "CASH" | "CARD",
                        }
                      : current
                  )
                }
              >
                <option value="CASH">{t("cash")}</option>
                <option value="CARD">{t("card")}</option>
              </select>
            </div>

            <div className="customer-fields" style={{ marginBottom: "0.85rem" }}>
              <div className="field">
                <label className="label" htmlFor="edit-customer-name">
                  {t("customerName")}
                </label>
                <input
                  className="input"
                  id="edit-customer-name"
                  value={editForm.customerName}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, customerName: event.target.value } : current
                    )
                  }
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="edit-customer-phone">
                  {t("customerPhone")}
                </label>
                <input
                  className="input"
                  id="edit-customer-phone"
                  value={editForm.customerPhone}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, customerPhone: event.target.value } : current
                    )
                  }
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="edit-customer-email">
                  {t("customerEmail")}
                </label>
                <input
                  className="input"
                  id="edit-customer-email"
                  type="email"
                  value={editForm.customerEmail}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, customerEmail: event.target.value } : current
                    )
                  }
                />
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <div className="label" style={{ marginBottom: "0.5rem" }}>
                {t("lineQuantities")}
              </div>
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {editForm.items.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 110px",
                      gap: "0.65rem",
                      alignItems: "end",
                    }}
                  >
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label" htmlFor={`edit-item-name-${item.id}`}>
                        {t("product")}
                      </label>
                      <input
                        className="input"
                        id={`edit-item-name-${item.id}`}
                        value={item.name}
                        readOnly
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label" htmlFor={`edit-item-qty-${item.id}`}>
                        {t("quantity")}
                      </label>
                      <input
                        className="input"
                        id={`edit-item-qty-${item.id}`}
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={item.quantity}
                        onChange={(event) => {
                          const quantity = Math.max(1, Number(event.target.value) || 1);
                          setEditForm((current) => {
                            if (!current) return current;
                            const items = [...current.items];
                            items[index] = { ...items[index], quantity };
                            return { ...current, items };
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={editSaving} type="submit">
                {editSaving ? `${t("saveSale")}…` : t("saveSale")}
              </button>
              <button
                className="btn btn-secondary"
                disabled={editSaving}
                onClick={closeEditSale}
                type="button"
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
