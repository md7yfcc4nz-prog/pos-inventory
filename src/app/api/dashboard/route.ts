import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AuthError,
  assertStoreAccess,
  getActiveStoreId,
  requireUser,
  resolveStoreId,
} from "@/lib/auth";
import { isExpired, isLowStock, isNearExpiry } from "@/lib/utils";

export async function GET() {
  try {
    const user = await requireUser();
    const storeId = await resolveStoreId(user, await getActiveStoreId());
    if (!storeId) {
      return NextResponse.json({
        metrics: {
          totalSkus: 0,
          totalUnits: 0,
          inventoryValue: 0,
          retailValue: 0,
          lowStockCount: 0,
          expiredCount: 0,
          nearExpiryCount: 0,
        },
        lowStock: [],
        expired: [],
        nearExpiry: [],
        recent: [],
        topProducts: [],
      });
    }

    await assertStoreAccess(user, storeId);

    const stockRows = await prisma.storeStock.findMany({
      where: { storeId, product: { archivedAt: null } },
      include: { product: true },
      orderBy: { product: { createdAt: "desc" } },
    });

    let totalUnits = 0;
    let inventoryValue = 0;
    let retailValue = 0;
    const lowStock = [];
    const expired = [];
    const nearExpiry = [];

    for (const row of stockRows) {
      totalUnits += row.quantity;
      inventoryValue += row.quantity * row.product.cost;
      retailValue += row.quantity * row.product.price;

      const item = {
        id: row.product.id,
        name: row.product.name,
        category: row.product.category,
        quantity: row.quantity,
        lowStockThreshold: row.product.lowStockThreshold,
        expiryDate: row.product.expiryDate,
        price: row.product.price,
        imagePath: row.product.imagePath,
      };

      if (isLowStock(row.quantity, row.product.lowStockThreshold)) {
        lowStock.push(item);
      }
      if (isExpired(row.product.expiryDate)) {
        expired.push(item);
      } else if (isNearExpiry(row.product.expiryDate)) {
        nearExpiry.push(item);
      }
    }

    const recent = await prisma.product.findMany({
      where: { archivedAt: null },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        stock: { where: { storeId } },
      },
    });

    const soldItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          storeId,
          status: "COMPLETED",
        },
      },
      include: {
        product: { select: { id: true, name: true, category: true } },
      },
    });

    const topMap = new Map<
      string,
      { productId: string; name: string; category: string; quantity: number; salesTotal: number }
    >();
    for (const item of soldItems) {
      const row = topMap.get(item.productId) || {
        productId: item.productId,
        name: item.product.name,
        category: item.product.category,
        quantity: 0,
        salesTotal: 0,
      };
      row.quantity += item.quantity;
      row.salesTotal += item.lineTotal;
      topMap.set(item.productId, row);
    }
    const topProducts = Array.from(topMap.values())
      .sort((a, b) => b.quantity - a.quantity || b.salesTotal - a.salesTotal)
      .slice(0, 5);

    return NextResponse.json({
      storeId,
      metrics: {
        totalSkus: stockRows.length,
        totalUnits,
        inventoryValue,
        retailValue,
        lowStockCount: lowStock.length,
        expiredCount: expired.length,
        nearExpiryCount: nearExpiry.length,
      },
      lowStock: lowStock.slice(0, 8),
      expired: expired.slice(0, 8),
      nearExpiry: nearExpiry.slice(0, 8),
      topProducts,
      recent: recent.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        createdAt: p.createdAt,
        quantity: p.stock[0]?.quantity ?? 0,
        imagePath: p.imagePath,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
