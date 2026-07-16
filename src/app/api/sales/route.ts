import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PaymentMethod } from "@/lib/constants";
import { sendAdminNotification } from "@/lib/notifications";
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

    return NextResponse.json({ sales, storeId });
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
    await sendAdminNotification({
      subject: `Kasuwa sale completed — ${formatMoney(sale.total)}`,
      text: [
        "A sale was completed in Kasuwa.",
        `Store: ${sale.store.name}`,
        `Cashier: ${sale.cashier.name}`,
        `Payment: ${sale.paymentMethod}`,
        `Items: ${itemSummary}`,
        `Total: ${formatMoney(sale.total)}`,
        `Date: ${sale.createdAt.toISOString()}`,
      ].join("\n"),
    });

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to complete sale" }, { status: 500 });
  }
}
