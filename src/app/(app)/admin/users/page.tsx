"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";

type Store = { id: string; name: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  stores: Store[];
};

export default function AdminUsersPage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("password123");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [storeId, setStoreId] = useState("");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    const [usersRes, storesRes] = await Promise.all([fetch("/api/users"), fetch("/api/stores")]);
    const usersData = await usersRes.json();
    const storesData = await storesRes.json();
    if (!usersRes.ok) {
      setError(usersData.error || "Failed to load users");
      return;
    }
    setUsers(usersData.users);
    setStores(storesData.stores || []);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(user: UserRow) {
    setEditingUser(user);
    setEditName(user.name);
    setEditPassword("");
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingUser(null);
    setEditName("");
    setEditPassword("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role,
        storeIds: role === "STAFF" && storeId ? [storeId] : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create user");
      return;
    }
    setName("");
    setEmail("");
    setPassword("password123");
    setRole("STAFF");
    setStoreId("");
    setMessage("User created");
    load();
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setError("");
    setMessage("");
    const payload: { name: string; password?: string } = {
      name: editName.trim(),
    };
    if (editPassword.trim()) {
      payload.password = editPassword.trim();
    }
    const res = await fetch(`/api/users/${editingUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      setError(data.error || "Failed to update user");
      return;
    }
    setMessage(t("userUpdated"));
    cancelEdit();
    await load();
  }

  async function removeUser(id: string) {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    if (editingUser?.id === id) cancelEdit();
    load();
  }

  async function assignStore(userId: string, nextStoreId: string) {
    if (!nextStoreId) return;
    setUpdatingId(userId);
    setError("");
    setMessage("");
    const res = await fetch(`/api/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeIds: [nextStoreId] }),
    });
    const data = await res.json();
    setUpdatingId("");
    if (!res.ok) {
      setError(data.error || "Failed to assign store");
      return;
    }
    setMessage(t("assignmentSaved"));
    await load();
  }

  return (
    <div>
      <h1 className="page-title">{t("users")}</h1>
      <p className="page-sub">{t("usersSubtitle")}</p>

      {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
      {message && (
        <div className="alert" style={{ marginBottom: "1rem", background: "var(--brand-soft)", border: "1px solid #93c5fd", color: "var(--brand)" }}>
          {message}
        </div>
      )}

      <div className="split-2">
        {editingUser ? (
          <form className="card" style={{ padding: "1.2rem" }} onSubmit={onSaveEdit}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>{t("editUser")}</h2>
            <div style={{ color: "var(--ink-muted)", marginBottom: "1rem", fontSize: "0.92rem" }}>
              {editingUser.email} · {editingUser.role}
            </div>
            <div className="field" style={{ marginBottom: "0.8rem" }}>
              <label className="label">{t("name")}</label>
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: "1rem" }}>
              <label className="label">{t("newPassword")}</label>
              <input
                className="input"
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                minLength={6}
                placeholder="••••••••"
              />
              <div style={{ color: "var(--ink-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                {t("newPasswordHint")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={savingEdit || !editName.trim()}>
                {savingEdit ? t("saving") : t("saveChanges")}
              </button>
              <button className="btn btn-secondary" type="button" onClick={cancelEdit} disabled={savingEdit}>
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : (
          <form className="card" style={{ padding: "1.2rem" }} onSubmit={onSubmit}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>{t("addUser")}</h2>
            <div className="field" style={{ marginBottom: "0.8rem" }}>
              <label className="label">{t("name")}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field" style={{ marginBottom: "0.8rem" }}>
              <label className="label">{t("email")}</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field" style={{ marginBottom: "0.8rem" }}>
              <label className="label">{t("password")}</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="field" style={{ marginBottom: "0.8rem" }}>
              <label className="label">{t("role")}</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")}>
                <option value="STAFF">{t("staff")}</option>
                <option value="ADMIN">{t("admin")}</option>
              </select>
            </div>
            {role === "STAFF" && (
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label className="label">{t("assignedStore")}</label>
                <select
                  className="select"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  required
                >
                  <option value="">{t("chooseStore")}</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn btn-primary">{t("createUser")}</button>
          </form>
        )}

        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("role")}</th>
                <th>{t("stores")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td data-label={t("name")}>
                    <div style={{ fontWeight: 600 }}>{user.name}</div>
                    <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>{user.email}</div>
                  </td>
                  <td data-label={t("role")}>
                    <span className="badge badge-neutral">{user.role}</span>
                  </td>
                  <td data-label={t("stores")}>
                    {user.role === "ADMIN" ? (
                      t("allStores")
                    ) : (
                      <select
                        className="select"
                        value={user.stores[0]?.id || ""}
                        disabled={updatingId === user.id}
                        onChange={(e) => assignStore(user.id, e.target.value)}
                        aria-label={t("assignedStore")}
                      >
                        <option value="">{t("chooseStore")}</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td data-label="">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary" type="button" onClick={() => startEdit(user)}>
                        {t("edit")}
                      </button>
                      <button className="btn btn-danger" type="button" onClick={() => removeUser(user.id)}>
                        {t("delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
