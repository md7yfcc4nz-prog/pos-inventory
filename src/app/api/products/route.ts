import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
import { isExpired, isLowStock } from "@/lib/utils";

const productSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["DRINKS", "MEDICINE", "OTHER"]),
  barcode: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  cost: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(10),
  expiryDate: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(0).default(0),
  storeId: z.string().optional(),
  imagePath: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const storeId = await resolveStoreId(user, searchParams.get("storeId") || (await getActiveStoreId()));
    if (!storeId) {
      return NextResponse.json({ products: [] });
    }
    await assertStoreAccess(user, storeId);

    const q = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category");
    const filter = searchParams.get("filter");
    const supplier = searchParams.get("supplier")?.trim() || "";

    const where: Prisma.ProductWhereInput = {};

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { barcode: { contains: q } },
      ];
    }

    if (category && Object.values(Category).includes(category as (typeof Category)[keyof typeof Category])) {
      where.category = category;
    }

    if (supplier) {
      where.supplier = { contains: supplier };
    }

    if (filter === "expired") {
      where.expiryDate = { lt: new Date() };
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        stock: {
          where: { storeId },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let mapped = products.map((p) => {
      const quantity = p.stock[0]?.quantity ?? 0;
      return {
        ...p,
        quantity,
        stockId: p.stock[0]?.id ?? null,
        lowStock: isLowStock(quantity, p.lowStockThreshold),
        expired: isExpired(p.expiryDate),
      };
    });

    if (filter === "low_stock") {
      mapped = mapped.filter((p) => p.lowStock);
    }

    if (filter === "drinks") {
      mapped = mapped.filter((p) => p.category === Category.DRINKS);
    }

    if (filter === "medicine") {
      mapped = mapped.filter((p) => p.category === Category.MEDICINE);
    }

    return NextResponse.json({ products: mapped, storeId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const parsed = productSchema.safeParse(body);
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

    if (data.barcode) {
      const existing = await prisma.product.findUnique({ where: { barcode: data.barcode } });
      if (existing) {
        return NextResponse.json({ error: "Barcode already exists" }, { status: 409 });
      }
    }

    const product = await prisma.product.create({
      data: {
        name: data.name,
        category: data.category,
        barcode: data.barcode || null,
        supplier: data.supplier || null,
        cost: data.cost,
        price: data.price,
        lowStockThreshold: data.lowStockThreshold,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        imagePath: data.imagePath || null,
        stock: {
          create: {
            storeId,
            quantity: data.quantity,
          },
        },
      },
      include: {
        stock: { where: { storeId } },
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
