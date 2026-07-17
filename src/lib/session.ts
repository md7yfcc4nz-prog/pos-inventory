import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/constants";

export const COOKIE_NAME = "pos_session";
export const STORE_COOKIE = "pos_store";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.id || !payload.email || !payload.role) return null;
    return {
      id: String(payload.id),
      name: String(payload.name ?? ""),
      email: String(payload.email),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return Promise.resolve(null);
  return verifySessionToken(token);
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(COOKIE_NAME);
  response.cookies.delete(STORE_COOKIE);
  return response;
}
