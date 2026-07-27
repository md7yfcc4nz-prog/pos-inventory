"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { AdminViewProvider, useAdminView } from "@/components/AdminViewContext";

type Store = { id: string; name: string };
type User = { id: string; email: string; role: "ADMIN" | "STAFF"; storeId: string | null };
type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

const nav: Array<{ href: string; labelKey: string; adminOnly?: boolean }> = [
  { href: "/", labelKey: "dashboard" },
  { href: "/inventory", labelKey: "inventory" },
  { href: "/pos", labelKey: "pos" },
  { href: "/sales", labelKey: "sales" },
  { href: "/expenses", labelKey: "expenses" },
  { href: "/admin/stores", labelKey: "stores", adminOnly: true },
  { href: "/admin/users", labelKey: "users", adminOnly: true },
  { href: "/admin/categories", labelKey: "categories", adminOnly: true },
];

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { showAdminFeatures, viewMode, setViewMode, isAdminUser } = useAdminView();
  const [user, setUser] = useState<User | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAdminUser || viewMode !== "staff" || !pathname.startsWith("/admin")) return;
    router.replace("/");
  }, [isAdminUser, viewMode, pathname, router]);

  useEffect(() => {
    async function load() {
      const [meRes, storesRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/stores"),
      ]);
      const me = await meRes.json();
      const storesData = await storesRes.json();
      setUser(me.user);
      setStores(storesData.stores || []);
      setActiveStoreId(me.activeStoreId || storesData.stores?.[0]?.id || "");
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!showAdminFeatures) {
      setNotifications([]);
      return;
    }
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => setNotifications(data.notifications || []))
      .catch(() => setNotifications([]));
  }, [showAdminFeatures]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function onStoreChange(storeId: string) {
    setActiveStoreId(storeId);
    await fetch("/api/stores/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
  }

  async function clearNotifications() {
    await fetch("/api/notifications", { method: "DELETE" });
    setNotifications([]);
  }

  async function enablePushAlerts() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushMessage("Push notifications are not supported in this browser.");
      return;
    }
    setPushBusy(true);
    setPushMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMessage(t("pushDenied"));
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to enable alerts");
      }
      setPushMessage(t("alertsOn"));
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Failed to enable alerts");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushAlerts() {
    setPushBusy(true);
    setPushMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPushMessage(t("disableAlerts"));
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Failed to disable alerts");
    } finally {
      setPushBusy(false);
    }
  }

  const unread = notifications.filter((item) => !item.readAt).length;
  const shellClass = [
    "app-shell",
    isAdminUser && viewMode === "admin" ? "admin-view" : "staff-view",
  ].join(" ");

  if (loading) {
    return <div className="empty">{t("loadingWorkspace")}</div>;
  }

  return (
    <div className={shellClass}>
      <div
        className={`sidebar-backdrop ${menuOpen ? "sidebar-backdrop-visible" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kasuwa Manager" className="brand-logo" />
          <div className="brand-mark">Kasuwa Manager</div>
          <div className="brand-sub">POS & Inventory</div>
        </div>
        <nav className="nav-list">
          {nav
            .filter((item) => !item.adminOnly || showAdminFeatures)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)) ? "active" : ""}`}
              >
                {t(item.labelKey)}
              </Link>
            ))}
        </nav>
        <button className="btn btn-secondary sidebar-signout" onClick={signOut}>
          {t("signOut")}
        </button>
      </aside>
      <div className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="btn btn-secondary mobile-menu-btn"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label="Open menu"
            >
              ☰
            </button>
            <div className="mobile-brand">Kasuwa Manager</div>
            <div className="topbar-meta">
              <span className="topbar-label">{t("signedInAs")}</span>
              <strong>{user?.email}</strong>
              <span
                className={`role-badge ${showAdminFeatures ? "role-badge-admin" : "role-badge-staff"}`}
              >
                {showAdminFeatures ? t("admin") : t("staff")}
              </span>
            </div>
          </div>
          <div className="topbar-actions">
            {isAdminUser && (
              <button
                type="button"
                className={`btn ${viewMode === "admin" ? "btn-accent" : "btn-primary"} view-mode-toggle`}
                onClick={() => setViewMode(viewMode === "admin" ? "staff" : "admin")}
              >
                {viewMode === "admin" ? t("switchToStaffView") : t("switchToAdminView")}
              </button>
            )}
            {showAdminFeatures && (
              <div className="notification-wrap">
                <details className="notification-panel">
                  <summary className="btn btn-secondary">
                    {t("notifications")}
                    {unread > 0 ? <span className="badge badge-danger">{unread}</span> : null}
                  </summary>
                  <div className="notification-dropdown">
                    <div className="notification-actions">
                      <button className="btn btn-secondary" onClick={markAllRead}>
                        {t("markAllRead")}
                      </button>
                      <button className="btn btn-secondary" onClick={clearNotifications}>
                        {t("clearAll")}
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="empty">{t("noNotifications")}</div>
                    ) : (
                      <ul className="notification-list">
                        {notifications.map((item) => (
                          <li key={item.id} className={item.readAt ? "" : "unread"}>
                            <strong>{item.title}</strong>
                            <p>{item.body}</p>
                            <small>{new Date(item.createdAt).toLocaleString()}</small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </div>
            )}
            {showAdminFeatures && (
              <div className="push-actions">
                <button className="btn btn-secondary" disabled={pushBusy} onClick={enablePushAlerts}>
                  {pushBusy ? t("processing") : t("enableAlerts")}
                </button>
                <button className="btn btn-secondary" disabled={pushBusy} onClick={disablePushAlerts}>
                  {t("disableAlerts")}
                </button>
              </div>
            )}
            {showAdminFeatures && stores.length > 0 && (
              <label className="store-switch">
                <span>{t("activeStore")}</span>
                <select
                  className="select"
                  value={activeStoreId}
                  onChange={(e) => onStoreChange(e.target.value)}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>
        {pushMessage ? <div className="push-banner">{pushMessage}</div> : null}
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        setIsAdminUser(data.user?.role === "ADMIN");
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="empty">Loading workspace…</div>;
  }

  return (
    <AdminViewProvider isAdminUser={isAdminUser}>
      <AppShellContent>{children}</AppShellContent>
    </AdminViewProvider>
  );
}
