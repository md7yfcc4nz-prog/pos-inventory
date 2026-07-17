import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().optional().nullable(),
});

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid store data" }, { status: 400 });
    }
    const existing = await prisma.store.findFirst({
      where: { id, archivedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    const store = await prisma.store.update({
      where: { id },
      data: {
        name: parsed.data.name,
        address: parsed.data.address || null,
      },
    });
    return NextResponse.json({ store });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update store" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;

    const [store, activeStoreCount] = await Promise.all([
      prisma.store.findFirst({ where: { id, archivedAt: null } }),
      prisma.store.count({ where: { archivedAt: null } }),
    ]);

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    if (activeStoreCount <= 1) {
      return NextResponse.json(
        { error: "You must keep at least one active store" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.userStore.deleteMany({ where: { storeId: id } }),
      prisma.store.update({
        where: { id },
        data: { archivedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to delete store" }, { status: 500 });
  }
}
