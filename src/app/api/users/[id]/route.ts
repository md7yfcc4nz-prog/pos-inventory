import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, hashPassword, requireAdmin } from "@/lib/auth";
import { isValidUsername, normalizeUsername } from "@/lib/usernames";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  username: z.string().min(2).max(40).optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  password: z.string().min(6).optional(),
  storeIds: z.array(z.string()).optional(),
});

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user data" }, { status: 400 });
    }

    const data = parsed.data;
    const existing = await prisma.user.findUnique({
      where: { id },
      include: { stores: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const finalRole = data.role || existing.role;
    const finalStoreIds = data.storeIds ?? existing.stores.map((store) => store.storeId);
    if (finalRole === "STAFF" && finalStoreIds.length !== 1) {
      return NextResponse.json(
        { error: "Staff must be assigned to exactly one store" },
        { status: 400 }
      );
    }

    let nextUsername: string | undefined;
    if (data.username !== undefined) {
      nextUsername = normalizeUsername(data.username);
      if (!nextUsername || !isValidUsername(nextUsername)) {
        return NextResponse.json(
          { error: "Username must be 2–40 characters (letters, numbers, . _ -)" },
          { status: 400 }
        );
      }
      const taken = await prisma.user.findFirst({
        where: { username: nextUsername, NOT: { id } },
      });
      if (taken) {
        return NextResponse.json({ error: "Username already in use" }, { status: 409 });
      }
    }

    let nextEmail: string | undefined;
    if (data.email !== undefined) {
      nextEmail = data.email.toLowerCase().trim();
      const taken = await prisma.user.findFirst({
        where: { email: nextEmail, NOT: { id } },
      });
      if (taken) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
    }

    const passwordHash = data.password ? await hashPassword(data.password) : undefined;

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: data.name,
          ...(nextEmail ? { email: nextEmail } : {}),
          ...(nextUsername ? { username: nextUsername } : {}),
          role: data.role,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      if (data.storeIds || data.role === "ADMIN") {
        await tx.userStore.deleteMany({ where: { userId: id } });
        if (finalRole === "STAFF" && finalStoreIds.length > 0) {
          await tx.userStore.createMany({
            data: finalStoreIds.map((storeId) => ({ userId: id, storeId })),
          });
        }
      }

      return updated;
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (admin.id === id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
