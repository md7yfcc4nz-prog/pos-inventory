"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AdminViewMode = "admin" | "staff";

type AdminViewContextValue = {
  viewMode: AdminViewMode;
  setViewMode: (mode: AdminViewMode) => void;
  isAdminUser: boolean;
  showAdminFeatures: boolean;
};

const STORAGE_KEY = "kasuwa-admin-view-mode";

const AdminViewContext = createContext<AdminViewContextValue | null>(null);

export function AdminViewProvider({
  isAdminUser,
  children,
}: {
  isAdminUser: boolean;
  children: React.ReactNode;
}) {
  const [viewMode, setViewModeState] = useState<AdminViewMode>("admin");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "admin" || saved === "staff") {
      setViewModeState(saved);
    }
  }, []);

  const value = useMemo<AdminViewContextValue>(
    () => ({
      viewMode,
      setViewMode(mode) {
        setViewModeState(mode);
        localStorage.setItem(STORAGE_KEY, mode);
      },
      isAdminUser,
      showAdminFeatures: isAdminUser && viewMode === "admin",
    }),
    [viewMode, isAdminUser]
  );

  return <AdminViewContext.Provider value={value}>{children}</AdminViewContext.Provider>;
}

export function useAdminView() {
  const context = useContext(AdminViewContext);
  if (!context) {
    throw new Error("useAdminView must be used within AdminViewProvider");
  }
  return context;
}
