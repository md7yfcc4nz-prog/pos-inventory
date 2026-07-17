"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format as formatCalendarDate,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useLanguage } from "@/components/LanguageProvider";
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
  salesTotal: number;
  returnsTotal: number;
  netTotal: number;
  salesCount: number;
  returnsCount: number;
};

type CalendarDay = Report;

type SalesCalendar = {
  month: string;
  days: Record<string, CalendarDay>;
};

export default function SalesPage() {
  const { language, t } = useLanguage();
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "COMPLETED" | "RETURNED">("ALL");
  const [busyId, setBusyId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(
    formatCalendarDate(new Date(), "yyyy-MM")
  );
  const [calendar, setCalendar] = useState<SalesCalendar | null>(null);
  const [reports, setReports] = useState<{
    allTime: Report;
    daily: Report;
    weekly: Report;
    monthly: Report;
  } | null>(null);

  useEffect(() => {
    setCalendarLoading(true);
    Promise.all([
      fetch(`/api/sales?month=${calendarMonth}`),
      fetch("/api/auth/me"),
    ])
      .then(async ([salesRes, meRes]) => {
        const salesData = await salesRes.json();
        const meData = await meRes.json();
        if (!salesRes.ok) throw new Error(salesData.error || "Failed to load sales");
        setSales(salesData.sales);
        setReports(salesData.reports);
        setCalendar(salesData.calendar);
        setIsAdmin(meData.user?.role === "ADMIN");
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setCalendarLoading(false);
      });
  }, [calendarMonth]);

  const visibleSales = useMemo(
    () => sales.filter((sale) => filter === "ALL" || sale.status === filter),
    [filter, sales]
  );

  const calendarView = useMemo(() => {
    const monthStart = startOfMonth(parseISO(`${calendarMonth}-01`));
    const days = eachDayOfInterval({
      start: monthStart,
      end: endOfMonth(monthStart),
    });
    const leadingDays = (monthStart.getDay() + 6) % 7;
    const weekdayFormatter = new Intl.DateTimeFormat(language, { weekday: "short" });
    const weekdays = Array.from({ length: 7 }, (_, index) =>
      weekdayFormatter.format(new Date(2026, 0, 5 + index))
    );
    const monthLabel = new Intl.DateTimeFormat(language, {
      month: "long",
      year: "numeric",
    }).format(monthStart);
    return { days, leadingDays, monthLabel, weekdays };
  }, [calendarMonth, language]);

  function changeMonth(offset: number) {
    const current = parseISO(`${calendarMonth}-01`);
    setCalendarMonth(formatCalendarDate(addMonths(current, offset), "yyyy-MM"));
  }

  function formatCalendarMoney(value: number) {
    return `${Math.round(value).toLocaleString(language)} FCFA`;
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
    const refreshed = await fetch(`/api/sales?month=${calendarMonth}`);
    if (refreshed.ok) {
      const refreshedData = await refreshed.json();
      setSales(refreshedData.sales);
      setReports(refreshedData.reports);
      setCalendar(refreshedData.calendar);
    }
  }

  return (
    <div>
      <h1 className="page-title">{t("salesHistory")}</h1>
      <p className="page-sub">{t("completedSalesReturns")}</p>

      {error && <div className="alert alert-danger">{error}</div>}

      {reports && (
        <>
          <div className="metric-grid sales-total-grid" style={{ marginBottom: "1rem" }}>
            <div className="metric-card">
              <div className="metric-label">{t("totalSales")}</div>
              <div className="metric-value">{formatMoney(reports.allTime.salesTotal)}</div>
              <div className="report-count">{reports.allTime.salesCount} {t("transactions")}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">{t("totalReturns")}</div>
              <div className="metric-value" style={{ color: "var(--warn)" }}>
                {formatMoney(reports.allTime.returnsTotal)}
              </div>
              <div className="report-count">{reports.allTime.returnsCount} {t("transactions")}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">{t("netSales")}</div>
              <div className="metric-value">{formatMoney(reports.allTime.netTotal)}</div>
            </div>
          </div>

          <h2 className="section-title">{t("salesReport")}</h2>
          <div className="report-grid">
            {([
              ["today", reports.daily],
              ["thisWeek", reports.weekly],
              ["thisMonth", reports.monthly],
            ] as Array<[string, Report]>).map(([label, report]) => (
              <div className="card report-card" key={label}>
                <strong>{t(label)}</strong>
                <div><span>{t("totalSales")}</span><b>{formatMoney(report.salesTotal)}</b></div>
                <div><span>{t("totalReturns")}</span><b>{formatMoney(report.returnsTotal)}</b></div>
                <div><span>{t("netSales")}</span><b>{formatMoney(report.netTotal)}</b></div>
              </div>
            ))}
          </div>

          <section className="card sales-calendar">
            <div className="calendar-header">
              <div>
                <h2 className="section-title">{t("dailySalesCalendar")}</h2>
                <p className="page-sub">{t("dailySalesCalendarSubtitle")}</p>
              </div>
              <div className="calendar-navigation">
                <button
                  className="btn btn-secondary calendar-nav-button"
                  type="button"
                  onClick={() => changeMonth(-1)}
                  aria-label={t("previousMonth")}
                >
                  ‹
                </button>
                <strong className="calendar-month">{calendarView.monthLabel}</strong>
                <button
                  className="btn btn-secondary calendar-nav-button"
                  type="button"
                  onClick={() => changeMonth(1)}
                  aria-label={t("nextMonth")}
                >
                  ›
                </button>
              </div>
            </div>

            <div className="calendar-grid" aria-busy={calendarLoading}>
              {calendarView.weekdays.map((weekday) => (
                <div className="calendar-weekday" key={weekday}>
                  {weekday}
                </div>
              ))}
              {Array.from({ length: calendarView.leadingDays }, (_, index) => (
                <div className="calendar-day calendar-day-empty" key={`empty-${index}`} />
              ))}
              {calendarView.days.map((date) => {
                const dateKey = formatCalendarDate(date, "yyyy-MM-dd");
                const day = calendar?.days[dateKey];
                const isToday =
                  dateKey === formatCalendarDate(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    className={`calendar-day${isToday ? " calendar-day-today" : ""}`}
                    key={dateKey}
                  >
                    <span className="calendar-date">{date.getDate()}</span>
                    {calendarLoading ? (
                      <span className="calendar-loading">…</span>
                    ) : day ? (
                      <div className="calendar-day-sales">
                        <strong title={formatMoney(day.salesTotal)}>
                          {formatCalendarMoney(day.salesTotal)}
                        </strong>
                        <span>
                          {day.salesCount} {t(day.salesCount === 1 ? "transaction" : "transactions")}
                        </span>
                        {day.returnsTotal > 0 && (
                          <span className="calendar-returns">
                            -{formatCalendarMoney(day.returnsTotal)} {t("returns").toLowerCase()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="calendar-no-sales">{t("noSales")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

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
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="empty">
                  {t("loading")}
                </td>
              </tr>
            ) : visibleSales.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="empty">
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
                  {isAdmin && (
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
    </div>
  );
}
