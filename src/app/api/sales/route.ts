import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PaymentMethod } from "@/lib/constants";
import { sendAdminNotification } from "@/lib/notifications";
import { sendAdminPush } from "@/lib/push";
import { formatMoney } from "@/lib/utils";
import {
  AuthError,
  assertStoreAccess,
  getActiveStoreId,
  requireUser,
  resolveStoreId,
} from "@/lib/auth";

const saleSchema = z.object({
  storeId: z.string().optional(),
  paymentMethod: z.enum(["CASH", "CARD"]).default(PaymentMethod.CASH),
  soldAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const storeId = await resolveStoreId(
      user,
      request.nextUrl.searchParams.get("storeId") || (await getActiveStoreId())
    );
    if (!storeId) {
      return NextResponse.json({ sales: [], requestedReport: null });
    }
    await assertStoreAccess(user, storeId);

    const sales = await prisma.sale.findMany({
      where: { storeId },
      include: {
        cashier: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, barcode: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    let requestedReport: {
      from: string;
      to: string;
      salesTotal: number;
      returnsTotal: number;
      netTotal: number;
      salesCount: number;
      returnsCount: number;
      byCategory: Array<{
        category: string;
        categoryName: string;
        salesTotal: number;
        quantity: number;
      }>;
      topProducts: Array<{
        productId: string;
        name: string;
        category: string;
        quantity: number;
        salesTotal: number;
      }>;
    } | null = null;

    if (from || to) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!from || !to || !datePattern.test(from) || !datePattern.test(to)) {
        return NextResponse.json(
          { error: "A valid start and end date are required" },
          { status: 400 }
        );
      }

      const rangeStart = new Date(`${from}T00:00:00.000Z`);
      const rangeLastDay = new Date(`${to}T00:00:00.000Z`);
      const rangeEnd = new Date(rangeLastDay);
      rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
      if (
        Number.isNaN(rangeStart.getTime()) ||
        Number.isNaN(rangeLastDay.getTime()) ||
        rangeStart.toISOString().slice(0, 10) !== from ||
        rangeLastDay.toISOString().slice(0, 10) !== to ||
        rangeStart > rangeLastDay
      ) {
        return NextResponse.json(
          { error: "The end date must be on or after the start date" },
          { status: 400 }
        );
      }

      const grossWhere: Prisma.SaleWhereInput = {
        storeId,
        createdAt: { gte: rangeStart, lt: rangeEnd },
      };
      const returnsWhere: Prisma.SaleWhereInput = {
        storeId,
        status: "RETURNED",
        returnedAt: { gte: rangeStart, lt: rangeEnd },
      };
      const [gross, returns, salesCount, returnsCount, saleItems, categories] =
        await Promise.all([
          prisma.sale.aggregate({
            where: grossWhere,
            _sum: { total: true },
          }),
          prisma.sale.aggregate({
            where: returnsWhere,
            _sum: { total: true },
          }),
          prisma.sale.count({ where: grossWhere }),
          prisma.sale.count({ where: returnsWhere }),
          prisma.saleItem.findMany({
            where: {
              sale: {
                storeId,
                status: "COMPLETED",
                createdAt: { gte: rangeStart, lt: rangeEnd },
              },
            },
            include: {
              product: { select: { id: true, name: true, category: true } },
            },
          }),
          prisma.productCategory.findMany({
            where: { archivedAt: null },
          }),
        ]);
      const salesTotal = gross._sum?.total ?? 0;
      const returnsTotal = returns._sum?.total ?? 0;
      const categoryNames = new Map(categories.map((c) => [c.key, c.name]));

      const categoryMap = new Map<
        string,
        { category: string; categoryName: string; salesTotal: number; quantity: number }
      >();
      const productMap = new Map<
        string,
        {
          productId: string;
          name: string;
          category: string;
          quantity: number;
          salesTotal: number;
        }
      >();

      for (const item of saleItems) {
        const categoryKey = item.product.category || "OTHER";
        const categoryRow = categoryMap.get(categoryKey) || {
          category: categoryKey,
          categoryName: categoryNames.get(categoryKey) || categoryKey,
          salesTotal: 0,
          quantity: 0,
        };
        categoryRow.salesTotal += item.lineTotal;
        categoryRow.quantity += item.quantity;
        categoryMap.set(categoryKey, categoryRow);

        const productRow = productMap.get(item.productId) || {
          productId: item.productId,
          name: item.product.name,
          category: categoryKey,
          quantity: 0,
          salesTotal: 0,
        };
        productRow.quantity += item.quantity;
        productRow.salesTotal += item.lineTotal;
        productMap.set(item.productId, productRow);
      }

      requestedReport = {
        from,
        to,
        salesTotal,
        returnsTotal,
        netTotal: salesTotal - returnsTotal,
        salesCount,
        returnsCount,
        byCategory: Array.from(categoryMap.values()).sort(
          (a, b) => b.salesTotal - a.salesTotal
        ),
        topProducts: Array.from(productMap.values())
          .sort((a, b) => b.quantity - a.quantity || b.salesTotal - a.salesTotal)
          .slice(0, 5),
      };
    }

    return NextResponse.json({
      sales,
      storeId,
      requestedReport,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load sales" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = saleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sale data" }, { status: 400 });
    }

    const storeId = await resolveStoreId(user, parsed.data.storeId || (await getActiveStoreId()));
    if (!storeId) {
      return NextResponse.json({ error: "No store available" }, { status: 400 });
    }
    await assertStoreAccess(user, storeId);

    let soldAt: Date | undefined;
    if (parsed.data.soldAt) {
      soldAt = new Date(`${parsed.data.soldAt}T12:00:00.000Z`);
      if (
        Number.isNaN(soldAt.getTime()) ||
        soldAt.toISOString().slice(0, 10) !== parsed.data.soldAt
      ) {
        return NextResponse.json({ error: "Invalid sale date" }, { status: 400 });
      }
      const tomorrow = new Date();
      tomorrow.setUTCHours(23, 59, 59, 999);
      if (soldAt > tomorrow) {
        return NextResponse.json({ error: "Sale date cannot be in the future" }, { status: 400 });
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      const lineItems: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }> = [];

      let subtotal = 0;

      for (const item of parsed.data.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          throw new AuthError(`Product not found: ${item.productId}`, 400);
        }

        const stock = await tx.storeStock.findUnique({
          where: {
            productId_storeId: { productId: item.productId, storeId },
          },
        });

        const available = stock?.quantity ?? 0;
        if (available < item.quantity) {
          throw new AuthError(`Insufficient stock for ${product.name}`, 400);
        }

        const lineTotal = product.price * item.quantity;
        subtotal += lineTotal;
        lineItems.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.price,
          lineTotal,
        });

        await tx.storeStock.update({
          where: {
            productId_storeId: { productId: item.productId, storeId },
          },
          data: {
            quantity: { decrement: item.quantity },
          },
        });
      }

      return tx.sale.create({
        data: {
          storeId,
          cashierId: user.id,
          paymentMethod: parsed.data.paymentMethod,
          subtotal,
          total: subtotal,
          ...(soldAt ? { createdAt: soldAt } : {}),
          items: {
            create: lineItems,
          },
        },
        include: {
          items: { include: { product: true } },
          cashier: { select: { name: true } },
          store: { select: { name: true } },
        },
      });
    });

    const itemSummary = sale.items
      .map((item) => `${item.product.name} ×${item.quantity}`)
      .join(", ");
    const subject = `Kasuwa Manager sale completed — ${formatMoney(sale.total)}`;
    const notificationText = [
        "A sale was completed in Kasuwa Manager.",
        `Store: ${sale.store.name}`,
        `Cashier: ${sale.cashier.name}`,
        `Payment: ${sale.paymentMethod}`,
        `Items: ${itemSummary}`,
        `Total: ${formatMoney(sale.total)}`,
        `Date: ${sale.createdAt.toISOString()}`,
      ].join("\n");
    await Promise.allSettled([
      prisma.notification.create({
        data: {
          type: "SALE",
          title: "Sale completed",
          message: `${sale.store.name}: ${formatMoney(sale.total)} — ${itemSummary}`,
          storeId: sale.storeId,
        },
      }),
      sendAdminNotification({ subject, text: notificationText }),
      sendAdminPush({
        title: "Sale completed",
        body: `${sale.store.name}: ${formatMoney(sale.total)} — ${itemSummary}`,
        url: "/sales",
      }),
    ]);

    const soldProductIds = sale.items.map((item) => item.productId);
    const stockRows = await prisma.storeStock.findMany({
      where: { storeId: sale.storeId, productId: { in: soldProductIds } },
      include: { product: true },
    });
    const lowStockNames = stockRows
      .filter((row) => row.quantity <= row.product.lowStockThreshold)
      .map((row) => `${row.product.name} (${row.quantity})`);
    if (lowStockNames.length > 0) {
      const lowStockMessage = `${sale.store.name}: ${lowStockNames.join(", ")}`;
      await Promise.allSettled([
        prisma.notification.create({
          data: {
            type: "LOW_STOCK",
            title: "Low stock alert",
            message: lowStockMessage,
            storeId: sale.storeId,
          },
        }),
        sendAdminNotification({
          subject: "Kasuwa Manager low stock alert",
          text: ["Low stock alert in Kasuwa Manager.", lowStockMessage].join("\n"),
        }),
        sendAdminPush({
          title: "Low stock alert",
          body: lowStockMessage,
          url: "/inventory?filter=low_stock",
        }),
      ]);
    }

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to complete sale" }, { status: 500 });
  }
}
