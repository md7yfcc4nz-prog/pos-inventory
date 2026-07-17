"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type User = { id: string; name: string; email: string; role: "ADMIN" | "STAFF" };
type AppNotification = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

const links = [
  { href: "/", labelKey: "dashboard" },
  { href: "/inventory", labelKey: "inventory" },
  { href: "/pos", labelKey: "pos" },
  { href: "/sales", labelKey: "sales" },
  { href: "/admin/stores", labelKey: "stores", admin: true },
  { href: "/admin/users", labelKey: "users", admin: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { language, setLanguage, t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setUser(data.user);
      setStores(data.stores || []);
      setActiveStoreId(data.activeStoreId || "");
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let cancelled = false;
    async function loadNotifications() {
      const res = await fetch("/api/notifications");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    }
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setPushSupported(supported);
    if (!supported) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch((error) => console.error("Push setup failed:", error));
  }, [user?.role]);

  async function switchStore(storeId: string) {
    setActiveStoreId(storeId);
    await fetch("/api/stores/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    router.refresh();
    window.location.reload();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifications((items) =>
      items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))
    );
    setUnreadCount(0);
  }

  async function clearNotifications() {
    if (!confirm(`${t("clearAll")} ${t("notifications").toLowerCase()}?`)) return;
    await fetch("/api/notifications", { method: "DELETE" });
    setNotifications([]);
    setUnreadCount(0);
  }

  function urlBase64ToUint8Array(value: string) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  async function enablePush() {
    setPushBusy(true);
    try {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        alert(t("pushDenied"));
        return;
      }
      const keyRes = await fetch("/api/push");
      const keyData = await keyRes.json();
      if (!keyRes.ok) throw new Error(keyData.error || "Push setup failed");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("Failed to save phone alerts");
      setPushEnabled(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Push setup failed");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
    } finally {
      setPushBusy(false);
    }
  }

  const activeStore = stores.find((store) => store.id === activeStoreId);

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">{t("loadingWorkspace")}</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {navOpen && <button className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-label="Close menu" />}
      <aside className={cn("sidebar", navOpen && "sidebar-open")}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kasuwa Manager" className="brand-logo" />
          <div className="brand-mark">Kasuwa Manager</div>
          <div className="brand-sub">POS & inventory</div>
        </div>
        <nav className="nav-list">
          {links
            .filter((l) => !l.admin || user?.role === "ADMIN")
            .map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setNavOpen(false)}
                className={cn(
                  "nav-link",
                  pathname === link.href ||
                    (link.href !== "/" && pathname.startsWith(link.href))
                    ? "active"
                    : ""
                )}
              >
                {t(link.labelKey)}
              </Link>
            ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "0.6rem" }}>
          <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>{t("signedInAs")}</div>
          <div style={{ fontWeight: 700 }}>{user?.name}</div>
          <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>{user?.role}</div>
          <button className="btn sidebar-signout" onClick={logout} type="button">
            {t("signOut")}
          </button>
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="store-welcome">
            <div className="welcome-text">
              {t("welcomeTo")} <strong>{activeStore?.name || t("activeStore")}</strong>
            </div>
            <select
              className="select"
              aria-label={t("activeStore")}
              value={activeStoreId}
              onChange={(e) => switchStore(e.target.value)}
              disabled={stores.length <= 1}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <div className="currency-note" style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginTop: 4 }}>
              {t("currencyNote")}
            </div>
          </div>
          <div className="topbar-actions">
            <select
              className="select language-select"
              aria-label={t("language")}
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "fr")}
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
            {user?.role === "ADMIN" && (
              <>
              {pushSupported && (
                <button
                  className={cn("btn", pushEnabled ? "btn-primary" : "btn-secondary", "push-btn")}
                  disabled={pushBusy}
                  onClick={pushEnabled ? disablePush : enablePush}
                  title={pushEnabled ? t("disableAlerts") : t("enableAlerts")}
                  type="button"
                >
                  {pushEnabled ? "📲✓" : "📲"}
                  <span>{pushEnabled ? t("alertsOn") : t("enableAlerts")}</span>
                </button>
              )}
              <div className="notification-wrap">
                <button
                  className="btn btn-secondary notification-btn"
                  onClick={() => setNotificationOpen((open) => !open)}
                  aria-label={t("notifications")}
                >
                  🔔
                  {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
                </button>
                {notificationOpen && (
                  <div className="notification-panel">
                    <div className="notification-header">
                      <strong>{t("notifications")}</strong>
                      <button className="text-button" onClick={markAllRead}>{t("markAllRead")}</button>
                    </div>
                    <div className="notification-list">
                      {notifications.length === 0 ? (
                        <div className="empty notification-empty">{t("noNotifications")}</div>
                      ) : (
                        notifications.map((item) => (
                          <div key={item.id} className={cn("notification-item", !item.readAt && "unread")}>
                            <strong>{item.title}</strong>
                            <div>{item.message}</div>
                            <small>{new Date(item.createdAt).toLocaleString(language)}</small>
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <button className="text-button notification-clear" onClick={clearNotifications}>
                        {t("clearAll")}
                      </button>
                    )}
                  </div>
                )}
              </div>
              </>
            )}
            <button className="btn btn-secondary signout-btn" onClick={logout}>
              {t("signOut")}
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
