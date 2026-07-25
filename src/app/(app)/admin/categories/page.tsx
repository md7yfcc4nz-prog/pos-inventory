"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";

type Category = {
  id: string;
  key: string;
  name: string;
  requiresExpiry: boolean;
};

export default function AdminCategoriesPage() {
  const { t } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [requiresExpiry, setRequiresExpiry] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("categoryLoadFailed"));
      return;
    }
    setCategories(data.categories);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      try {
        const res = await fetch("/api/categories");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || t("categoryLoadFailed"));
          return;
        }
        setCategories(data.categories);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("categoryLoadFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, requiresExpiry }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("categorySaveFailed"));
      return;
    }
    setName("");
    setRequiresExpiry(false);
    setMessage(t("categorySaved"));
    await load();
  }

  async function editCategory(category: Category) {
    const nextName = prompt(t("name"), category.name);
    if (nextName === null || !nextName.trim()) return;
    const nextRequires = confirm(
      `${t("requiresExpiry")}?\nOK = ${t("yes")}, Cancel = ${t("no")}`
    );
    setError("");
    setMessage("");
    const res = await fetch(`/api/categories/${category.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName.trim(), requiresExpiry: nextRequires }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("categorySaveFailed"));
      return;
    }
    setMessage(t("categoryUpdated"));
    await load();
  }

  async function removeCategory(category: Category) {
    if (!confirm(`${t("delete")} ${category.name}?`)) return;
    setError("");
    setMessage("");
    const res = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("categoryDeleteFailed"));
      return;
    }
    setMessage(t("categoryDeleted"));
    await load();
  }

  return (
    <div>
      <h1 className="page-title">{t("categories")}</h1>
      <p className="page-sub">{t("categoriesSubtitle")}</p>

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

      <div className="split-2">
        <form className="card" style={{ padding: "1.2rem" }} onSubmit={onSubmit}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>{t("addCategory")}</h2>
          <div className="field" style={{ marginBottom: "0.9rem" }}>
            <label className="label">{t("name")}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("categoryNamePlaceholder")}
              required
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              marginBottom: "1rem",
              color: "var(--ink-muted)",
            }}
          >
            <input
              type="checkbox"
              checked={requiresExpiry}
              onChange={(e) => setRequiresExpiry(e.target.checked)}
            />
            {t("requiresExpiry")}
          </label>
          <button className="btn btn-primary" type="submit">
            {t("createCategory")}
          </button>
        </form>

        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("requiresExpiry")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="empty">
                    {t("loading")}
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">
                    {t("noCategories")}
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr key={category.id}>
                    <td data-label={t("name")}>{category.name}</td>
                    <td data-label={t("requiresExpiry")}>
                      {category.requiresExpiry ? t("yes") : t("no")}
                    </td>
                    <td data-label="">
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => editCategory(category)}
                        >
                          {t("edit")}
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => removeCategory(category)}
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
