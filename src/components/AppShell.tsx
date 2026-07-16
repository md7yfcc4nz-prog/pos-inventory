"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type User = { id: string; name: string; email: string; role: "ADMIN" | "STAFF" };

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/pos", label: "Point of Sale" },
  { href: "/sales", label: "Sales" },
  { href: "/admin/stores", label: "Stores", admin: true },
  { href: "/admin/users", label: "Users", admin: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string>("");
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">Loading workspace…</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ShelfLedger</div>
          <div className="brand-sub">Multi-store POS & inventory</div>
        </div>
        <nav className="nav-list">
          {links
            .filter((l) => !l.admin || user?.role === "ADMIN")
            .map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "nav-link",
                  pathname === link.href ||
                    (link.href !== "/" && pathname.startsWith(link.href))
                    ? "active"
                    : ""
                )}
              >
                {link.label}
              </Link>
            ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "0.6rem" }}>
          <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Signed in as</div>
          <div style={{ fontWeight: 700 }}>{user?.name}</div>
          <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>{user?.role}</div>
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div>
            <div style={{ fontWeight: 700 }}>Active store</div>
            <select
              className="select"
              style={{ minWidth: 220, marginTop: 4 }}
              value={activeStoreId}
              onChange={(e) => switchStore(e.target.value)}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={logout}>
            Sign out
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
