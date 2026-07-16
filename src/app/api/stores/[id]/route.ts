import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

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
