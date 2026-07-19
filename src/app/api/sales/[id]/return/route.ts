import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";
import { sendAdminNotification } from "@/lib/notifications";
import { formatMoney } from "@/lib/utils";
import { sendAdminPush } from "@/lib/push";

type Params = { params: Promise<{ id: string }> };

const returnSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = returnSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid return reason" }, { status: 400 });
    }

    const sale = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        throw new AuthError("Sale not found", 404);
      }
      if (existing.status === "RETURNED") {
        throw new AuthError("This sale has already been returned", 409);
      }

      for (const item of existing.items) {
        await tx.storeStock.upsert({
          where: {
            productId_storeId: {
              productId: item.productId,
              storeId: existing.storeId,
            },
          },
          create: {
            productId: item.productId,
            storeId: existing.storeId,
            quantity: item.quantity,
          },
          update: {
            quantity: { increment: item.quantity },
          },
        });
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: "RETURNED",
          returnedAt: new Date(),
          returnedByName: admin.name,
          returnReason: parsed.data.reason || null,
        },
        include: {
          cashier: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, barcode: true } },
            },
          },
        },
      });
    });

    const returnMessage = `${admin.name} returned a sale worth ${formatMoney(sale.total)}`;
    await Promise.allSettled([
      prisma.notification.create({
        data: {
          type: "RETURN",
          title: "Sale returned",
          message: returnMessage,
          storeId: sale.storeId,
        },
      }),
      sendAdminNotification({
        subject: `Kasuwa Manager sale returned — ${formatMoney(sale.total)}`,
        text: [
          "A sale was returned in Kasuwa Manager.",
          `Returned by: ${admin.name}`,
          `Total: ${formatMoney(sale.total)}`,
          parsed.data.reason ? `Reason: ${parsed.data.reason}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
      sendAdminPush({
        title: "Sale returned",
        body: returnMessage,
        url: "/sales",
      }),
    ]);

    return NextResponse.json({ sale });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to return sale" }, { status: 500 });
  }
}
