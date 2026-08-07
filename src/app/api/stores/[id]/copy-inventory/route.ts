import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  sourceStoreId: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id: targetStoreId } = await params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "sourceStoreId is required" }, { status: 400 });
    }

    const { sourceStoreId } = parsed.data;
    if (sourceStoreId === targetStoreId) {
      return NextResponse.json(
        { error: "Source and target store must be different" },
        { status: 400 }
      );
    }

    const [source, target] = await Promise.all([
      prisma.store.findFirst({ where: { id: sourceStoreId, archivedAt: null } }),
      prisma.store.findFirst({ where: { id: targetStoreId, archivedAt: null } }),
    ]);

    if (!source) {
      return NextResponse.json({ error: "Source store not found" }, { status: 404 });
    }
    if (!target) {
      return NextResponse.json({ error: "Target store not found" }, { status: 404 });
    }

    const sourceStock = await prisma.storeStock.findMany({
      where: {
        storeId: sourceStoreId,
        product: { archivedAt: null },
      },
      select: { productId: true, quantity: true },
    });

    let copied = 0;
    for (const row of sourceStock) {
      await prisma.storeStock.upsert({
        where: {
          productId_storeId: {
            productId: row.productId,
            storeId: targetStoreId,
          },
        },
        create: {
          productId: row.productId,
          storeId: targetStoreId,
          quantity: row.quantity,
        },
        update: {
          quantity: row.quantity,
        },
      });
      copied += 1;
    }

    return NextResponse.json({
      ok: true,
      sourceStoreId,
      targetStoreId,
      copied,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to copy inventory" }, { status: 500 });
  }
}
