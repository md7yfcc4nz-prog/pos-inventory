"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type FormState = {
  name: string;
  category: "DRINKS" | "MEDICINE" | "OTHER";
  barcode: string;
  supplier: string;
  cost: string;
  price: string;
  quantity: string;
  lowStockThreshold: string;
  expiryDate: string;
  imagePath: string;
};

const empty: FormState = {
  name: "",
  category: "OTHER",
  barcode: "",
  supplier: "",
  cost: "0",
  price: "0",
  quantity: "0",
  lowStockThreshold: "10",
  expiryDate: "",
  imagePath: "",
};

export default function ProductFormPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/products/${params.id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        const p = data.product;
        setForm({
          name: p.name,
          category: p.category,
          barcode: p.barcode || "",
          supplier: p.supplier || "",
          cost: String(p.cost),
          price: String(p.price),
          quantity: String(p.quantity ?? 0),
          lowStockThreshold: String(p.lowStockThreshold),
          expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : "",
          imagePath: p.imagePath || "",
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isNew, params.id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function uploadImage(file: File) {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(data.error || "Upload failed");
      return;
    }
    update("imagePath", data.imagePath);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name,
      category: form.category,
      barcode: form.barcode || null,
      supplier: form.supplier || null,
      cost: Number(form.cost),
      price: Number(form.price),
      quantity: Number(form.quantity),
      lowStockThreshold: Number(form.lowStockThreshold),
      expiryDate: form.expiryDate || null,
      imagePath: form.imagePath || null,
    };

    const res = await fetch(isNew ? "/api/products" : `/api/products/${params.id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    router.push("/inventory");
    router.refresh();
  }

  if (loading) return <div className="empty">Loading product…</div>;

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 className="page-title">{isNew ? "Add product" : "Edit product"}</h1>
      <p className="page-sub">Include barcode, supplier, stock level, and optional image.</p>

      {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}

      <form className="card" style={{ padding: "1.2rem" }} onSubmit={onSubmit}>
        <div className="split-2" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Category</label>
            <select
              className="select"
              value={form.category}
              onChange={(e) => update("category", e.target.value as FormState["category"])}
            >
              <option value="DRINKS">Drinks</option>
              <option value="MEDICINE">Medicine</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="split-2" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label className="label">Barcode</label>
            <input className="input" value={form.barcode} onChange={(e) => update("barcode", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Supplier</label>
            <input className="input" value={form.supplier} onChange={(e) => update("supplier", e.target.value)} />
          </div>
        </div>

        <div className="split-3" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label className="label">Cost</label>
            <input className="input" type="number" step="0.01" min="0" value={form.cost} onChange={(e) => update("cost", e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Sell price</label>
            <input className="input" type="number" step="0.01" min="0" value={form.price} onChange={(e) => update("price", e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Quantity (this store)</label>
            <input className="input" type="number" min="0" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} required />
          </div>
        </div>

        <div className="split-2" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label className="label">Low stock threshold</label>
            <input className="input" type="number" min="0" value={form.lowStockThreshold} onChange={(e) => update("lowStockThreshold", e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Expiry date {form.category === "MEDICINE" ? "(required)" : "(optional)"}</label>
            <input
              className="input"
              type="date"
              value={form.expiryDate}
              onChange={(e) => update("expiryDate", e.target.value)}
              required={form.category === "MEDICINE"}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: "1.2rem" }}>
          <label className="label">Product image</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadImage(file);
            }}
          />
          {uploading && <div style={{ color: "var(--ink-muted)", marginTop: 6 }}>Uploading…</div>}
          {form.imagePath && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.imagePath} alt="" className="product-thumb" style={{ width: 72, height: 72 }} />
              <span style={{ color: "var(--ink-muted)" }}>{form.imagePath}</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/inventory")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
