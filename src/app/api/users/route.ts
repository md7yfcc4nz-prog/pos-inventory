import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, hashPassword, requireAdmin } from "@/lib/auth";
import { Role } from "@/lib/constants";

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      include: {
        stores: { include: { store: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        stores: u.stores.map((s) => s.store),
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "STAFF"]).default(Role.STAFF),
  storeIds: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user data" }, { status: 400 });
    }

    if (parsed.data.role === Role.STAFF && parsed.data.storeIds.length !== 1) {
      return NextResponse.json(
        { error: "Staff must be assigned to exactly one store" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const assignedStoreIds =
      parsed.data.role === Role.STAFF ? parsed.data.storeIds.slice(0, 1) : [];
    if (assignedStoreIds.length === 1) {
      const store = await prisma.store.findFirst({
        where: { id: assignedStoreIds[0], archivedAt: null },
      });
      if (!store) {
        return NextResponse.json({ error: "Store not found" }, { status: 400 });
      }
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        role: parsed.data.role,
        stores: {
          create: assignedStoreIds.map((storeId) => ({ storeId })),
        },
      },
      include: {
        stores: { include: { store: true } },
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        stores: user.stores.map((s) => s.store),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
