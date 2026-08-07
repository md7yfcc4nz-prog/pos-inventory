import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Category } from "@/lib/constants";
import { sendAdminNotification } from "@/lib/notifications";
import { sendAdminPush } from "@/lib/push";
import {
  AuthError,
  assertStoreAccess,
  getActiveStoreId,
  requireUser,
  resolveStoreId,
} from "@/lib/auth";
import { formatMoney, isExpired, isLowStock } from "@/lib/utils";

const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  barcode: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  cost: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(10),
  expiryDate: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(0).default(0),
  storeId: z.string().optional(),
  imagePath: z.string().optional().nullable(),
  addedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

    // Products are a shared catalog, but inventory is per-store via StoreStock.
    // Only list products that have a stock row for this store so new stores start empty
    // and never appear to inherit another store's inventory.
    const where: Prisma.ProductWhereInput = {
      archivedAt: null,
      stock: { some: { storeId } },
    };

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { barcode: { contains: q } },
      ];
    }

    if (category) {
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
        createdBy: { select: { id: true, name: true } },
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
        addedBy: p.createdBy?.name || null,
        addedAt: p.createdAt,
      };
    });

    if (filter === "low_stock") {
      mapped = mapped.filter((p) => p.lowStock);
    }

    // Legacy filter keys + any active category key (e.g. DRINKS, MEDICINE, custom).
    if (filter && filter !== "low_stock" && filter !== "expired") {
      const categoryKey =
        filter === "drinks"
          ? Category.DRINKS
          : filter === "medicine"
            ? Category.MEDICINE
            : filter;
      mapped = mapped.filter((p) => p.category === categoryKey);
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
    const user = await requireUser();
    const body = await request.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const categoryRow = await prisma.productCategory.findFirst({
      where: { key: data.category, archivedAt: null },
    });
    if (!categoryRow) {
      return NextResponse.json({ error: "Unknown product category" }, { status: 400 });
    }
    if ((categoryRow.requiresExpiry || data.category === Category.MEDICINE) && !data.expiryDate) {
      return NextResponse.json({ error: "Expiry date is required for this category" }, { status: 400 });
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

    let createdAt: Date | undefined;
    if (data.addedAt) {
      createdAt = new Date(`${data.addedAt}T12:00:00.000Z`);
      if (
        Number.isNaN(createdAt.getTime()) ||
        createdAt.toISOString().slice(0, 10) !== data.addedAt
      ) {
        return NextResponse.json({ error: "Invalid added date" }, { status: 400 });
      }
      const tomorrow = new Date();
      tomorrow.setUTCHours(23, 59, 59, 999);
      if (createdAt > tomorrow) {
        return NextResponse.json({ error: "Added date cannot be in the future" }, { status: 400 });
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
        createdById: user.id,
        ...(createdAt ? { createdAt } : {}),
        stock: {
          create: {
            storeId,
            quantity: data.quantity,
          },
        },
      },
      include: {
        stock: { where: { storeId } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    const subject = `Kasuwa Manager product added — ${product.name}`;
    const notificationText = [
        "A product was added to Kasuwa Manager inventory.",
        `Product: ${product.name}`,
        `Store: ${store?.name || "Unknown store"}`,
        `Quantity: ${data.quantity}`,
        `Cost: ${formatMoney(product.cost)}`,
        `Sell price: ${formatMoney(product.price)}`,
        `Added by: ${user.name}`,
      ].join("\n");
    await Promise.allSettled([
      prisma.notification.create({
        data: {
          type: "PRODUCT",
          title: "Product added",
          message: `${product.name} ×${data.quantity} added to ${store?.name || "inventory"}`,
          storeId,
        },
      }),
      sendAdminNotification({ subject, text: notificationText }),
      sendAdminPush({
        title: "Product added",
        body: `${product.name} ×${data.quantity} added to ${store?.name || "inventory"}`,
        url: "/inventory",
      }),
    ]);

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
