import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** Admin-only: remove all StoreStock rows for a store. Does not delete products or sales. */
export async function POST(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: storeId } = await params;

    const store = await prisma.store.findFirst({
      where: { id: storeId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const result = await prisma.storeStock.deleteMany({
      where: { storeId },
    });

    return NextResponse.json({
      ok: true,
      storeId: store.id,
      storeName: store.name,
      deleted: result.count,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to clear inventory" }, { status: 500 });
  }
}
