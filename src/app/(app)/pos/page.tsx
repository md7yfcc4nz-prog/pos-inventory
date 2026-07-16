"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  quantity: number;
  imagePath: string | null;
};

type CartItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  maxQty: number;
};

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/products")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load products");
        setProducts(data.products);
      })
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [products, query]);

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  function addToCart(product: Product) {
    if (product.quantity <= 0) {
      setError(`${product.name} is out of stock`);
      return;
    }
    setError("");
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          setError(`Only ${product.quantity} available`);
          return prev;
        }
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
          maxQty: product.quantity,
        },
      ];
    });
  }

  function setQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(1, Math.min(item.maxQty, quantity)) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function checkout() {
    if (cart.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Sale failed");
      return;
    }
    setMessage(`Sale complete — ${formatMoney(data.sale.total)} (${paymentMethod})`);
    setCart([]);
    const refreshed = await fetch("/api/products");
    const json = await refreshed.json();
    if (refreshed.ok) setProducts(json.products);
  }

  function onBarcodeEnter() {
    const exact = products.find((p) => p.barcode && p.barcode === query.trim());
    if (exact) {
      addToCart(exact);
      setQuery("");
    }
  }

  return (
    <div>
      <h1 className="page-title">Point of Sale</h1>
      <p className="page-sub">Scan or search products, build a cart, and complete the sale.</p>

      {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
      {message && <div className="alert" style={{ marginBottom: "1rem", background: "var(--brand-soft)", border: "1px solid #b7d8c8", color: "var(--brand)" }}>{message}</div>}

      <div className="pos-layout">
        <section className="card" style={{ padding: "1rem" }}>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label">Search / barcode</label>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onBarcodeEnter();
              }}
              placeholder="Type name or scan barcode, then Enter"
              autoFocus
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {filtered.map((p) => (
              <button
                key={p.id}
                className="card"
                style={{
                  padding: "0.85rem",
                  textAlign: "left",
                  cursor: p.quantity > 0 ? "pointer" : "not-allowed",
                  opacity: p.quantity > 0 ? 1 : 0.5,
                  border: "1px solid var(--line)",
                  background: "white",
                }}
                onClick={() => addToCart(p)}
                disabled={p.quantity <= 0}
                type="button"
              >
                {p.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagePath} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
                ) : (
                  <div className="thumb-fallback" style={{ width: "100%", height: 80, marginBottom: 8, borderRadius: 8 }}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
                  {formatMoney(p.price)} · {p.quantity} left
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: "1rem", position: "sticky", top: 90 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>Cart</h2>
          {cart.length === 0 ? (
            <div className="empty">Cart is empty</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.productId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                          {formatMoney(item.unitPrice)}
                        </div>
                      </td>
                      <td>
                        <input
                          className="input"
                          style={{ width: 72 }}
                          type="number"
                          min={1}
                          max={item.maxQty}
                          value={item.quantity}
                          onChange={(e) => setQty(item.productId, Number(e.target.value))}
                        />
                      </td>
                      <td>{formatMoney(item.unitPrice * item.quantity)}</td>
                      <td>
                        <button className="btn btn-danger" type="button" onClick={() => removeItem(item.productId)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: "1rem", display: "grid", gap: "0.8rem" }}>
            <div className="field">
              <label className="label">Payment method</label>
              <select
                className="select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "CARD")}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--ink-muted)" }}>Subtotal</span>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem" }}>
                {formatMoney(subtotal)}
              </strong>
            </div>
            <button className="btn btn-accent" disabled={busy || cart.length === 0} onClick={checkout}>
              {busy ? "Processing…" : "Complete sale"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
