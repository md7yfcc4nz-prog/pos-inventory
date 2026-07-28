import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  applySessionCookie,
  createSessionToken,
  verifyPassword,
  getAccessibleStores,
} from "@/lib/auth";
import type { Role } from "@/lib/constants";
import type { SessionUser } from "@/lib/session";
import { normalizeUsername } from "@/lib/usernames";

const schema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Support older clients that still send { email }
    const loginValue =
      typeof body?.login === "string"
        ? body.login
        : typeof body?.email === "string"
          ? body.email
          : "";
    const parsed = schema.safeParse({
      login: loginValue,
      password: body?.password,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
    }

    const raw = parsed.data.login.trim();
    const lowered = raw.toLowerCase();
    const username = normalizeUsername(raw);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: lowered },
          ...(username ? [{ username }] : []),
        ],
      },
    });

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email, username, or password" }, { status: 401 });
    }

    const sessionUser: SessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
    };

    const token = await createSessionToken(sessionUser);
    const stores = await getAccessibleStores(sessionUser);
    const response = NextResponse.json({
      user: sessionUser,
      stores,
    });

    applySessionCookie(response, token);

    if (stores[0]) {
      response.cookies.set("pos_store", stores[0].id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
