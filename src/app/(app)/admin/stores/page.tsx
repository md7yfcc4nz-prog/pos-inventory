"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";

type Store = {
  id: string;
  name: string;
  address: string | null;
};

export default function AdminStoresPage() {
  const { t } = useLanguage();
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/stores");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load stores");
      return;
    }
    setStores(data.stores);
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create store");
      return;
    }
    setName("");
    setAddress("");
    setMessage("Store created");
    load();
  }

  async function removeStore(store: Store) {
    if (
      !confirm(
        `Delete ${store.name}? It will disappear from the app, but its past sales will be kept for records.`
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    const res = await fetch(`/api/stores/${store.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete store");
      return;
    }
    setMessage("Store deleted");
    await load();
    window.location.reload();
  }

  return (
    <div>
      <h1 className="page-title">{t("stores")}</h1>
      <p className="page-sub">Manage multiple store locations from one admin account.</p>

      {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
      {message && (
        <div className="alert" style={{ marginBottom: "1rem", background: "var(--brand-soft)", border: "1px solid #b7d8c8", color: "var(--brand)" }}>
          {message}
        </div>
      )}

      <div className="split-2">
        <form className="card" style={{ padding: "1.2rem" }} onSubmit={onSubmit}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>{t("addStore")}</h2>
          <div className="field" style={{ marginBottom: "0.9rem" }}>
            <label className="label">{t("name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label">{t("address")}</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <button className="btn btn-primary">{t("createStore")}</button>
        </form>

        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("address")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id}>
                  <td>{store.name}</td>
                  <td>{store.address || "—"}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      onClick={() => removeStore(store)}
                      type="button"
                    >
                      {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {stores.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty">
                    No stores yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
