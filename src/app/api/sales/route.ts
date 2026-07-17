import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { addMonths, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
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
      return NextResponse.json({ sales: [] });
    }
    await assertStoreAccess(user, storeId);
    const reportStoreId: string = storeId;
    const requestedMonth = request.nextUrl.searchParams.get("month");
    const monthMatch = requestedMonth?.match(/^(\d{4})-(\d{2})$/);
    const requestedMonthNumber = monthMatch ? Number(monthMatch[2]) : 0;
    const monthDate = monthMatch && requestedMonthNumber >= 1 && requestedMonthNumber <= 12
      ? new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1)
      : startOfMonth(new Date());
    const calendarStart = startOfMonth(monthDate);
    const calendarEnd = addMonths(calendarStart, 1);

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

    async function reportSince(start?: Date) {
      const grossWhere: Prisma.SaleWhereInput = {
        storeId: reportStoreId,
        ...(start ? { createdAt: { gte: start } } : {}),
      };
      const returnsWhere: Prisma.SaleWhereInput = {
        storeId: reportStoreId,
        status: "RETURNED",
        returnedAt: start ? { gte: start } : { not: null },
      };
      const [gross, returns, salesCount, returnsCount] = await Promise.all([
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
      ]);
      const salesTotal = gross._sum?.total ?? 0;
      const returnsTotal = returns._sum?.total ?? 0;
      return {
        salesTotal,
        returnsTotal,
        netTotal: salesTotal - returnsTotal,
        salesCount,
        returnsCount,
      };
    }

    const now = new Date();
    const [allTime, daily, weekly, monthly] = await Promise.all([
      reportSince(),
      reportSince(startOfDay(now)),
      reportSince(startOfWeek(now, { weekStartsOn: 1 })),
      reportSince(startOfMonth(now)),
    ]);

    const calendarSales = await prisma.sale.findMany({
      where: {
        storeId: reportStoreId,
        OR: [
          { createdAt: { gte: calendarStart, lt: calendarEnd } },
          {
            status: "RETURNED",
            returnedAt: { gte: calendarStart, lt: calendarEnd },
          },
        ],
      },
      select: {
        total: true,
        createdAt: true,
        status: true,
        returnedAt: true,
      },
    });

    const calendarDays: Record<string, {
      salesTotal: number;
      returnsTotal: number;
      netTotal: number;
      salesCount: number;
      returnsCount: number;
    }> = {};

    function getCalendarDay(date: Date) {
      const key = format(date, "yyyy-MM-dd");
      calendarDays[key] ??= {
        salesTotal: 0,
        returnsTotal: 0,
        netTotal: 0,
        salesCount: 0,
        returnsCount: 0,
      };
      return calendarDays[key];
    }

    for (const sale of calendarSales) {
      if (sale.createdAt >= calendarStart && sale.createdAt < calendarEnd) {
        const day = getCalendarDay(sale.createdAt);
        day.salesTotal += sale.total;
        day.salesCount += 1;
      }
      if (
        sale.status === "RETURNED" &&
        sale.returnedAt &&
        sale.returnedAt >= calendarStart &&
        sale.returnedAt < calendarEnd
      ) {
        const day = getCalendarDay(sale.returnedAt);
        day.returnsTotal += sale.total;
        day.returnsCount += 1;
      }
    }

    for (const day of Object.values(calendarDays)) {
      day.netTotal = day.salesTotal - day.returnsTotal;
    }

    return NextResponse.json({
      sales,
      storeId,
      reports: { allTime, daily, weekly, monthly },
      calendar: {
        month: format(calendarStart, "yyyy-MM"),
        days: calendarDays,
      },
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
