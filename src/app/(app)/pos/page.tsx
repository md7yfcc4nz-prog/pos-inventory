"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
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

type CompletedSale = {
  id: string;
  total: number;
  paymentMethod: string;
  createdAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  store: { name: string };
  cashier: { name: string };
  items: Array<{
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    product: { name: string };
  }>;
};

export default function PosPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [saleDate, setSaleDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
  });
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [sendReceiptEmail, setSendReceiptEmail] = useState(false);
  const [sendReceiptSms, setSendReceiptSms] = useState(false);
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
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

  function resetCustomer() {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setSendReceiptEmail(false);
    setSendReceiptSms(false);
  }

  async function checkout() {
    if (cart.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    setLastSale(null);
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod,
        soldAt: saleDate,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        sendReceiptEmail,
        sendReceiptSms,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Sale failed");
      return;
    }

    const sale = data.sale as CompletedSale;
    setLastSale(sale);
    const receipt = data.receipt as
      | {
          emailed?: boolean;
          smsed?: boolean;
          emailError?: string;
          smsError?: string;
        }
      | undefined;

    const receiptBits: string[] = [];
    if (receipt?.emailed) receiptBits.push(t("receiptEmailed"));
    else if (sendReceiptEmail) receiptBits.push(t("receiptEmailFailed"));
    if (receipt?.smsed) receiptBits.push(t("receiptSmsSent"));
    else if (sendReceiptSms) receiptBits.push(t("receiptSmsFailed"));
    setMessage(
      [
        `${t("saleComplete")} — ${formatMoney(sale.total)} (${paymentMethod})`,
        ...receiptBits,
      ].join(" · ")
    );
    setCart([]);
    resetCustomer();
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

  function printReceipt() {
    if (!lastSale) return;
    window.print();
  }

  return (
    <div>
      <h1 className="page-title">{t("pos")}</h1>
      <p className="page-sub">{t("posSubtitle")}</p>

      {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
      {message && (
        <div
          className="alert no-print"
          style={{ marginBottom: "1rem", background: "var(--brand-soft)", border: "1px solid #93c5fd", color: "var(--brand)" }}
        >
          {message}
          {lastSale && (
            <div style={{ marginTop: "0.65rem" }}>
              <button className="btn btn-secondary" type="button" onClick={printReceipt}>
                {t("printReceipt")}
              </button>
            </div>
          )}
        </div>
      )}

      {lastSale && (
        <div className="receipt-print card" aria-hidden={!lastSale}>
          <h1>Kasuwa Manager</h1>
          <div>{lastSale.store.name}</div>
          <div>{new Date(lastSale.createdAt).toLocaleString()}</div>
          <div>
            {t("cashier")}: {lastSale.cashier.name}
          </div>
          {lastSale.customerName && (
            <div>
              {t("customer")}: {lastSale.customerName}
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>{t("item")}</th>
                <th>{t("quantity")}</th>
                <th>{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {lastSale.items.map((item, index) => (
                <tr key={`${item.product.name}-${index}`}>
                  <td>{item.product.name}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.lineTotal)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={2}>{t("total")}</td>
                <td>{formatMoney(lastSale.total)}</td>
              </tr>
            </tbody>
          </table>
          <div>
            {t("payment")}: {lastSale.paymentMethod}
          </div>
        </div>
      )}

      <div className="pos-layout no-print">
        <section className="card" style={{ padding: "1rem" }}>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label">{t("searchBarcode")}</label>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onBarcodeEnter();
              }}
              placeholder={t("searchPlaceholder")}
              autoFocus
            />
          </div>

          <div
            className="pos-product-grid"
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
                  {formatMoney(p.price)} · {p.quantity} {t("left")}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="card pos-cart" style={{ padding: "1rem", position: "sticky", top: 90 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>{t("cart")}</h2>
          {cart.length === 0 ? (
            <div className="empty">{t("cartEmpty")}</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("item")}</th>
                    <th>{t("quantity")}</th>
                    <th>{t("total")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.productId}>
                      <td data-label={t("item")}>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                          {formatMoney(item.unitPrice)}
                        </div>
                      </td>
                      <td data-label={t("quantity")}>
                        <input
                          className="input"
                          style={{ width: "100%", maxWidth: 88 }}
                          type="number"
                          min={1}
                          max={item.maxQty}
                          value={item.quantity}
                          onChange={(e) => setQty(item.productId, Number(e.target.value))}
                        />
                      </td>
                      <td data-label={t("total")}>{formatMoney(item.unitPrice * item.quantity)}</td>
                      <td data-label="">
                        <button className="btn btn-danger" type="button" onClick={() => removeItem(item.productId)}>
                          {t("remove")}
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
              <label className="label">{t("saleDate")}</label>
              <input
                className="input"
                type="date"
                value={saleDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setSaleDate(e.target.value)}
              />
              <div style={{ color: "var(--ink-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                {t("lateSaleHint")}
              </div>
            </div>
            <div className="field">
              <label className="label">{t("paymentMethod")}</label>
              <select
                className="select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "CARD")}
              >
                <option value="CASH">{t("cash")}</option>
                <option value="CARD">{t("card")}</option>
              </select>
            </div>

            <div className="customer-fields">
              <div style={{ fontWeight: 700 }}>{t("customerDetails")}</div>
              <div className="field">
                <label className="label">{t("customerName")}</label>
                <input
                  className="input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t("optional")}
                />
              </div>
              <div className="field">
                <label className="label">{t("customerPhone")}</label>
                <input
                  className="input"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+227…"
                />
              </div>
              <div className="field">
                <label className="label">{t("customerEmail")}</label>
                <input
                  className="input"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="name@email.com"
                />
              </div>
              <div className="receipt-options">
                <label className="receipt-option">
                  <input
                    type="checkbox"
                    checked={sendReceiptEmail}
                    disabled={!customerEmail.trim()}
                    onChange={(e) => setSendReceiptEmail(e.target.checked)}
                  />
                  {t("emailReceipt")}
                </label>
                <label className="receipt-option">
                  <input
                    type="checkbox"
                    checked={sendReceiptSms}
                    disabled={!customerPhone.trim()}
                    onChange={(e) => setSendReceiptSms(e.target.checked)}
                  />
                  {t("smsReceipt")}
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--ink-muted)" }}>{t("subtotal")}</span>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem" }}>
                {formatMoney(subtotal)}
              </strong>
            </div>
            <button className="btn btn-accent" disabled={busy || cart.length === 0} onClick={checkout}>
              {busy ? t("processing") : t("completeSale")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
