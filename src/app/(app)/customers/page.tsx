"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatMoney } from "@/lib/utils";

type CustomerRow = {
  customerKey: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  lastSaleAt: string;
  lastSaleId: string;
  salesCount: number;
  totalSpent: number;
};

export default function CustomersPage() {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    fetch("/api/customers")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load customers");
        setCustomers(data.customers || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load customers"));
  }, []);

  async function sendReceipt(customer: CustomerRow) {
    const email = customer.customerEmail || "";
    const phone = customer.customerPhone || "";
    const name = customer.customerName || "";

    if (!email && !phone) {
      setError(t("noCustomerContact"));
      return;
    }

    if (!customer.lastSaleId) return;

    setBusyId(customer.customerKey);
    setError("");
    const res = await fetch(`/api/sales/${customer.lastSaleId}/receipt`, {
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

    // Refresh list to show updated totals (and to keep UI consistent).
    const refreshed = await fetch("/api/customers");
    const refreshedData = await refreshed.json();
    if (refreshed.ok) setCustomers(refreshedData.customers || []);
  }

  return (
    <div>
      <h1 className="page-title">{t("customers")}</h1>
      <p className="page-sub">{t("customersSubtitle")}</p>

      {error ? <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div> : null}

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t("customer")}</th>
              <th>{t("customerEmail")}</th>
              <th>{t("customerPhone")}</th>
              <th>{t("date")}</th>
              <th>{t("transactions")}</th>
              <th>{t("total")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  {t("noProductsYet")}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.customerKey}>
                  <td data-label={t("customer")}>
                    <div style={{ fontWeight: 700 }}>{c.customerName || "—"}</div>
                    <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                      {c.customerKey.startsWith("email:") ? "Email" : c.customerKey.startsWith("phone:") ? "Phone" : "Name"}
                    </div>
                  </td>
                  <td data-label={t("customerEmail")}>{c.customerEmail || "—"}</td>
                  <td data-label={t("customerPhone")}>{c.customerPhone || "—"}</td>
                  <td data-label={t("date")}>{c.lastSaleAt ? new Date(c.lastSaleAt).toLocaleDateString() : "—"}</td>
                  <td data-label={t("transactions")}>{c.salesCount}</td>
                  <td data-label={t("total")}>{formatMoney(c.totalSpent)}</td>
                  <td data-label="">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={busyId === c.customerKey}
                      onClick={() => sendReceipt(c)}
                    >
                      {busyId === c.customerKey ? `${t("sendReceipt")}…` : t("sendReceipt")}
                    </button>
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

