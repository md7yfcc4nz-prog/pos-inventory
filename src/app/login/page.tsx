"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLanguage } from "@/components/LanguageProvider";

function LoginForm() {
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }
    router.replace(searchParams.get("next") || "/");
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div style={{ marginBottom: "1.4rem", textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kasuwa Manager" className="login-logo" />
          <div className="brand-mark" style={{ color: "var(--brand-navy)", marginTop: "0.75rem" }}>
            Kasuwa Manager
          </div>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            {t("loginSubtitle")}
          </p>
          <p className="page-sub" style={{ marginTop: "0.55rem", marginBottom: 0, fontSize: "0.88rem" }}>
            {t("concurrentLoginHint")}
          </p>
        </div>

        {error ? <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div> : null}

        <div className="field" style={{ marginBottom: "0.9rem" }}>
          <label className="label" htmlFor="login">
            {t("emailOrUsername")}
          </label>
          <input
            id="login"
            className="input"
            type="text"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            placeholder={t("emailOrUsernamePlaceholder")}
          />
        </div>

        <div className="field" style={{ marginBottom: "1.2rem" }}>
          <label className="label" htmlFor="password">
            {t("password")}
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? t("signingIn") : t("signIn")}
        </button>

        <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>{t("language")}</span>
          <select
            className="select language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "fr")}
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
          </select>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-page">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
