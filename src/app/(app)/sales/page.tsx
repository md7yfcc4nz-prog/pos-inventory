"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "COMPLETED" | "RETURNED">("ALL");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/sales"), fetch("/api/auth/me")])
      .then(async ([salesRes, meRes]) => {
        const salesData = await salesRes.json();
        const meData = await meRes.json();
        if (!salesRes.ok) throw new Error(salesData.error || "Failed to load sales");
        setSales(salesData.sales);
        setIsAdmin(meData.user?.role === "ADMIN");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const visibleSales = useMemo(
    () => sales.filter((sale) => filter === "ALL" || sale.status === filter),
    [filter, sales]
  );

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
  }

  return (
    <div>
      <h1 className="page-title">Sales history</h1>
      <p className="page-sub">Completed sales and returns for the active store.</p>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="filters">
        {(["ALL", "COMPLETED", "RETURNED"] as const).map((value) => (
          <button
            key={value}
            className={`chip ${filter === value ? "active" : ""}`}
            onClick={() => setFilter(value)}
            type="button"
          >
            {value === "ALL" ? "All" : value === "COMPLETED" ? "Sales" : "Returns"}
          </button>
        ))}
      </div>

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Cashier</th>
              <th>Items</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Total</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="empty">
                  Loading…
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
                  <td>{formatDate(sale.createdAt)}</td>
                  <td>{sale.cashier.name}</td>
                  <td>
                    {sale.items.map((i) => `${i.product.name} ×${i.quantity}`).join(", ")}
                  </td>
                  <td>
                    <span className="badge badge-neutral">{sale.paymentMethod}</span>
                  </td>
                  <td>
                    {sale.status === "RETURNED" ? (
                      <div>
                        <span className="badge badge-warn">Returned</span>
                        {sale.returnReason && (
                          <div style={{ marginTop: 5, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                            {sale.returnReason}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="badge badge-ok">Completed</span>
                    )}
                  </td>
                  <td>
                    {sale.status === "RETURNED" ? `-${formatMoney(sale.total)}` : formatMoney(sale.total)}
                  </td>
                  {isAdmin && (
                    <td>
                      {sale.status !== "RETURNED" && (
                        <button
                          className="btn btn-danger"
                          disabled={busyId === sale.id}
                          onClick={() => returnSale(sale)}
                          type="button"
                        >
                          {busyId === sale.id ? "Returning…" : "Return sale"}
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
