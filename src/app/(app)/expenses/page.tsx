"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatDate, formatMoney } from "@/lib/utils";

type Expense = {
  id: string;
  description: string;
  amount: number;
  incurredAt: string;
  createdAt: string;
  createdBy: { name: string };
};

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function toDateInput(value: string) {
  return value.slice(0, 10);
}

export default function ExpensesPage() {
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(todayLocal());

  async function load() {
    const res = await fetch("/api/expenses");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("expenseLoadFailed"));
      return;
    }
    setExpenses(data.expenses);
    setTotal(data.total || 0);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadExpenses() {
      try {
        const res = await fetch("/api/expenses");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Failed to load expenses");
          return;
        }
        setExpenses(data.expenses);
        setTotal(data.total || 0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load expenses");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadExpenses();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t("invalidExpense"));
      return;
    }
    setSaving(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        amount: parsedAmount,
        incurredAt,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || t("expenseSaveFailed"));
      return;
    }
    setDescription("");
    setAmount("");
    setIncurredAt(todayLocal());
    setMessage(t("expenseSaved"));
    await load();
  }

  async function editExpense(expense: Expense) {
    const nextDescription = prompt(t("expenseDescription"), expense.description);
    if (nextDescription === null || !nextDescription.trim()) return;
    const nextAmountRaw = prompt(t("amountFcfa"), String(expense.amount));
    if (nextAmountRaw === null) return;
    const nextAmount = Number(nextAmountRaw);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setError(t("invalidExpense"));
      return;
    }
    const nextDate = prompt(t("date"), toDateInput(expense.incurredAt));
    if (nextDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      setError(t("invalidExpense"));
      return;
    }

    setError("");
    setMessage("");
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: nextDescription,
        amount: nextAmount,
        incurredAt: nextDate,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("expenseSaveFailed"));
      return;
    }
    setMessage(t("expenseUpdated"));
    await load();
  }

  async function removeExpense(expense: Expense) {
    if (!confirm(`${t("delete")} ${expense.description}?`)) return;
    setError("");
    setMessage("");
    const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("expenseDeleteFailed"));
      return;
    }
    setMessage(t("expenseDeleted"));
    await load();
  }

  return (
    <div>
      <h1 className="page-title">{t("expenses")}</h1>
      <p className="page-sub">{t("expensesSubtitle")}</p>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && (
        <div
          className="alert"
          style={{
            marginBottom: "1rem",
            background: "var(--brand-soft)",
            border: "1px solid #b7d8c8",
            color: "var(--brand)",
          }}
        >
          {message}
        </div>
      )}

      <div className="metric-card" style={{ marginBottom: "1rem" }}>
        <div className="metric-label">{t("totalExpenses")}</div>
        <div className="metric-value">{formatMoney(total)}</div>
        <div className="report-count">
          {expenses.length} {t("transactions")}
        </div>
      </div>

      <div className="split-2">
        <form className="card" style={{ padding: "1.2rem" }} onSubmit={onSubmit}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>{t("addExpense")}</h2>
          <div className="field" style={{ marginBottom: "0.9rem" }}>
            <label className="label" htmlFor="expense-date">
              {t("date")}
            </label>
            <input
              id="expense-date"
              className="input"
              type="date"
              value={incurredAt}
              onChange={(e) => setIncurredAt(e.target.value)}
              required
            />
          </div>
          <div className="field" style={{ marginBottom: "0.9rem" }}>
            <label className="label" htmlFor="expense-description">
              {t("expenseDescription")}
            </label>
            <input
              id="expense-description"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("expenseDescriptionPlaceholder")}
              required
            />
          </div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="expense-amount">
              {t("amountFcfa")}
            </label>
            <input
              id="expense-amount"
              className="input"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? t("saving") : t("saveExpense")}
          </button>
        </form>

        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("expenseDescription")}</th>
                <th>{t("amount")}</th>
                <th>{t("recordedBy")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="empty">
                    {t("loading")}
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    {t("noExpenses")}
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td data-label={t("date")}>{formatDate(expense.incurredAt)}</td>
                    <td data-label={t("expenseDescription")}>{expense.description}</td>
                    <td data-label={t("amount")}>{formatMoney(expense.amount)}</td>
                    <td data-label={t("recordedBy")}>{expense.createdBy.name}</td>
                    <td data-label="">
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => editExpense(expense)}
                        >
                          {t("edit")}
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => removeExpense(expense)}
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
