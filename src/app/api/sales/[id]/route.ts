import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";
import { sendAdminNotification } from "@/lib/notifications";
import { sendAdminPush } from "@/lib/push";
import { formatMoney } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

const saleInclude = {
  cashier: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, barcode: true } },
    },
  },
} as const;

const editSchema = z.object({
  paymentMethod: z.enum(["CASH", "CARD"]).optional(),
  soldAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  customerName: z.string().trim().max(120).optional().nullable(),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  customerEmail: z.string().trim().max(120).optional().nullable(),
  items: z
    .array(
      z.object({
        id: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1)
    .optional(),
});

function localDateKey(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function parseSoldAt(soldAt: string, previous?: Date): Date {
  const now = new Date();
  const localToday = localDateKey(now);

  // Keep the original clock time when the calendar day did not change.
  if (previous && localDateKey(previous) === soldAt) {
    return previous;
  }

  // Moving a sale onto "today" → stamp with the current time.
  if (soldAt === localToday) {
    return now;
  }

  // Late / backdated day → noon UTC (date-only semantics).
  const date = new Date(`${soldAt}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== soldAt) {
    throw new AuthError("Invalid sale date", 400);
  }
  const tomorrow = new Date();
  tomorrow.setUTCHours(23, 59, 59, 999);
  if (date > tomorrow) {
    throw new AuthError("Sale date cannot be in the future", 400);
  }
  return date;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sale data" }, { status: 400 });
    }

    const customerEmail =
      parsed.data.customerEmail === undefined
        ? undefined
        : parsed.data.customerEmail?.trim() || null;
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return NextResponse.json({ error: "Invalid customer email" }, { status: 400 });
    }

    const sale = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        throw new AuthError("Sale not found", 404);
      }
      if (existing.status !== "COMPLETED") {
        throw new AuthError("Only completed sales can be edited", 409);
      }

      const data: {
        paymentMethod?: string;
        createdAt?: Date;
        customerName?: string | null;
        customerPhone?: string | null;
        customerEmail?: string | null;
        subtotal?: number;
        total?: number;
      } = {};

      if (parsed.data.paymentMethod) {
        data.paymentMethod = parsed.data.paymentMethod;
      }
      if (parsed.data.soldAt) {
        data.createdAt = parseSoldAt(parsed.data.soldAt, existing.createdAt);
      }
      if (parsed.data.customerName !== undefined) {
        data.customerName = parsed.data.customerName?.trim() || null;
      }
      if (parsed.data.customerPhone !== undefined) {
        data.customerPhone = parsed.data.customerPhone?.trim() || null;
      }
      if (customerEmail !== undefined) {
        data.customerEmail = customerEmail;
      }

      if (parsed.data.items) {
        const existingById = new Map(existing.items.map((item) => [item.id, item]));
        if (parsed.data.items.length !== existing.items.length) {
          throw new AuthError("All existing line items must be included", 400);
        }
        for (const item of parsed.data.items) {
          if (!existingById.has(item.id)) {
            throw new AuthError("Unknown sale line item", 400);
          }
        }

        let subtotal = 0;
        for (const update of parsed.data.items) {
          const current = existingById.get(update.id)!;
          const delta = update.quantity - current.quantity;

          if (delta > 0) {
            const stock = await tx.storeStock.findUnique({
              where: {
                productId_storeId: {
                  productId: current.productId,
                  storeId: existing.storeId,
                },
              },
            });
            const available = stock?.quantity ?? 0;
            if (available < delta) {
              const product = await tx.product.findUnique({
                where: { id: current.productId },
                select: { name: true },
              });
              throw new AuthError(
                `Insufficient stock for ${product?.name || "product"}`,
                400
              );
            }
            await tx.storeStock.update({
              where: {
                productId_storeId: {
                  productId: current.productId,
                  storeId: existing.storeId,
                },
              },
              data: { quantity: { decrement: delta } },
            });
          } else if (delta < 0) {
            await tx.storeStock.upsert({
              where: {
                productId_storeId: {
                  productId: current.productId,
                  storeId: existing.storeId,
                },
              },
              create: {
                productId: current.productId,
                storeId: existing.storeId,
                quantity: Math.abs(delta),
              },
              update: {
                quantity: { increment: Math.abs(delta) },
              },
            });
          }

          const lineTotal = current.unitPrice * update.quantity;
          subtotal += lineTotal;
          await tx.saleItem.update({
            where: { id: current.id },
            data: {
              quantity: update.quantity,
              lineTotal,
            },
          });
        }

        data.subtotal = subtotal;
        data.total = subtotal;
      }

      return tx.sale.update({
        where: { id },
        data,
        include: saleInclude,
      });
    });

    const editMessage = `${admin.name} edited a sale (${formatMoney(sale.total)})`;
    await Promise.allSettled([
      prisma.notification.create({
        data: {
          type: "SALE",
          title: "Sale edited",
          message: editMessage,
          storeId: sale.storeId,
        },
      }),
      sendAdminNotification({
        subject: `Kasuwa Manager sale edited — ${formatMoney(sale.total)}`,
        text: [
          "A completed sale was edited in Kasuwa Manager.",
          `Edited by: ${admin.name}`,
          `Payment: ${sale.paymentMethod}`,
          `Total: ${formatMoney(sale.total)}`,
        ].join("\n"),
      }),
      sendAdminPush({
        title: "Sale edited",
        body: editMessage,
        url: "/sales",
      }),
    ]);

    return NextResponse.json({ sale });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to edit sale" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const sale = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id },
        include: {
          items: true,
          cashier: { select: { id: true, name: true } },
        },
      });

      if (!existing) {
        throw new AuthError("Sale not found", 404);
      }

      // COMPLETED sales still hold inventory; restore before delete.
      // RETURNED sales already restored stock on return — delete only.
      if (existing.status === "COMPLETED") {
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
      }

      await tx.sale.delete({ where: { id } });
      return existing;
    });

    const deleteMessage = `${admin.name} deleted a ${sale.status.toLowerCase()} sale worth ${formatMoney(sale.total)}`;
    await Promise.allSettled([
      prisma.notification.create({
        data: {
          type: "SALE",
          title: "Sale deleted",
          message: deleteMessage,
          storeId: sale.storeId,
        },
      }),
      sendAdminNotification({
        subject: `Kasuwa Manager sale deleted — ${formatMoney(sale.total)}`,
        text: [
          "A sale was permanently deleted in Kasuwa Manager.",
          `Deleted by: ${admin.name}`,
          `Status: ${sale.status}`,
          `Payment: ${sale.paymentMethod}`,
          `Total: ${formatMoney(sale.total)}`,
          sale.status === "COMPLETED"
            ? "Inventory was restored for this completed sale."
            : "Inventory was not changed (already restored on return).",
        ].join("\n"),
      }),
      sendAdminPush({
        title: "Sale deleted",
        body: deleteMessage,
        url: "/sales",
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 });
  }
}
