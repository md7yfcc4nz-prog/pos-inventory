import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Category } from "@/lib/constants";
import {
  AuthError,
  assertStoreAccess,
  getActiveStoreId,
  requireAdmin,
  requireUser,
  resolveStoreId,
} from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["DRINKS", "MEDICINE", "OTHER"]),
  barcode: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  cost: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  lowStockThreshold: z.coerce.number().int().min(0),
  expiryDate: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(0),
  storeId: z.string().optional(),
  imagePath: z.string().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const storeId = await resolveStoreId(user, await getActiveStoreId());
    if (!storeId) {
      return NextResponse.json({ error: "No store" }, { status: 400 });
    }
    await assertStoreAccess(user, storeId);

    const product = await prisma.product.findUnique({
      where: { id },
      include: { stock: { where: { storeId } } },
    });

    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      product: {
        ...product,
        quantity: product.stock[0]?.quantity ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load product" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    if (data.category === Category.MEDICINE && !data.expiryDate) {
      return NextResponse.json({ error: "Expiry date is required for medicine" }, { status: 400 });
    }

    const storeId = await resolveStoreId(user, data.storeId || (await getActiveStoreId()));
    if (!storeId) {
      return NextResponse.json({ error: "No store available" }, { status: 400 });
    }
    await assertStoreAccess(user, storeId);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (data.barcode) {
      const clash = await prisma.product.findFirst({
        where: { barcode: data.barcode, NOT: { id } },
      });
      if (clash) {
        return NextResponse.json({ error: "Barcode already exists" }, { status: 409 });
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          category: data.category,
          barcode: data.barcode || null,
          supplier: data.supplier || null,
          cost: data.cost,
          price: data.price,
          lowStockThreshold: data.lowStockThreshold,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          imagePath: data.imagePath ?? existing.imagePath,
        },
      });

      await tx.storeStock.upsert({
        where: {
          productId_storeId: { productId: id, storeId },
        },
        create: {
          productId: id,
          storeId,
          quantity: data.quantity,
        },
        update: {
          quantity: data.quantity,
        },
      });

      return updated;
    });

    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
