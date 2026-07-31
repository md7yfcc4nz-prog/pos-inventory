import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

/**
 * Admin-only: permanently delete all sales and return transactions.
 * Inventory quantities are left unchanged.
 */
export async function POST() {
  try {
    await requireAdmin();

    const [saleItems, sales, saleNotifications] = await prisma.$transaction([
      prisma.saleItem.deleteMany(),
      prisma.sale.deleteMany(),
      prisma.notification.deleteMany({
        where: { type: { in: ["SALE", "RETURN"] } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        saleItems: saleItems.count,
        sales: sales.count,
        notifications: saleNotifications.count,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to reset sales" }, { status: 500 });
  }
}
