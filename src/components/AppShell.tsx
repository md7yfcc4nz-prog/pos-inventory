"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type User = { id: string; name: string; email: string; role: "ADMIN" | "STAFF" };
type Notification = {
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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
          <div className="brand-mark">Kasuwa</div>
          <div className="brand-sub">Multi-store POS & inventory</div>
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
