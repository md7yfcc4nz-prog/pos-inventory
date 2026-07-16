"use client";

import { FormEvent, useEffect, useState } from "react";

type Store = { id: string; name: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  stores: Store[];
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("password123");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  function toggleStore(id: string) {
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role, storeIds }),
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
    setStoreIds([]);
    setMessage("User created");
    load();
  }

  async function removeUser(id: string) {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    load();
  }

  return (
    <div>
      <h1 className="page-title">Users</h1>
      <p className="page-sub">Create admin and staff accounts and assign store access.</p>

      {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
      {message && (
        <div className="alert" style={{ marginBottom: "1rem", background: "var(--brand-soft)", border: "1px solid #b7d8c8", color: "var(--brand)" }}>
          {message}
        </div>
      )}

      <div className="split-2">
        <form className="card" style={{ padding: "1.2rem" }} onSubmit={onSubmit}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>Add user</h2>
          <div className="field" style={{ marginBottom: "0.8rem" }}>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: "0.8rem" }}>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: "0.8rem" }}>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: "0.8rem" }}>
            <label className="label">Role</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")}>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label">Assigned stores</label>
            <div style={{ display: "grid", gap: 6 }}>
              {stores.map((store) => (
                <label key={store.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={storeIds.includes(store.id)}
                    onChange={() => toggleStore(store.id)}
                  />
                  {store.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn btn-primary">Create user</button>
        </form>

        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Stores</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{user.name}</div>
                    <div style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>{user.email}</div>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{user.role}</span>
                  </td>
                  <td>{user.stores.map((s) => s.name).join(", ") || "—"}</td>
                  <td>
                    <button className="btn btn-danger" onClick={() => removeUser(user.id)}>
                      Delete
                    </button>
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
