import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { Role } from "@/lib/constants";
import { prisma } from "./db";
import {
  COOKIE_NAME,
  STORE_COOKIE,
  type SessionUser,
  verifySessionToken,
} from "./session";

export type { SessionUser };
export {
  createSessionToken,
  verifySessionToken,
  getSessionFromRequest,
  applySessionCookie,
  clearAuthCookies,
  COOKIE_NAME,
  STORE_COOKIE,
} from "./session";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(STORE_COOKIE);
}

export async function getActiveStoreId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(STORE_COOKIE)?.value ?? null;
}

export async function setActiveStoreId(storeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function requireUser() {
  const user = await getSession();
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== Role.ADMIN) {
    throw new AuthError("Forbidden", 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function getAccessibleStores(user: SessionUser) {
  if (user.role === Role.ADMIN) {
    return prisma.store.findMany({ orderBy: { name: "asc" } });
  }
  const links = await prisma.userStore.findMany({
    where: { userId: user.id },
    include: { store: true },
    orderBy: { store: { name: "asc" } },
  });
  return links.map((l) => l.store);
}

export async function resolveStoreId(user: SessionUser, preferredStoreId?: string | null) {
  const stores = await getAccessibleStores(user);
  if (stores.length === 0) return null;

  if (preferredStoreId && stores.some((s) => s.id === preferredStoreId)) {
    return preferredStoreId;
  }

  const cookieStoreId = await getActiveStoreId();
  if (cookieStoreId && stores.some((s) => s.id === cookieStoreId)) {
    return cookieStoreId;
  }

  return stores[0].id;
}

export async function assertStoreAccess(user: SessionUser, storeId: string) {
  const stores = await getAccessibleStores(user);
  if (!stores.some((s) => s.id === storeId)) {
    throw new AuthError("No access to this store", 403);
  }
}
