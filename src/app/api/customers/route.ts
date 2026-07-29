import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, getActiveStoreId, requireUser, resolveStoreId, assertStoreAccess } from "@/lib/auth";

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const storeId = await resolveStoreId(
      user,
      request.nextUrl.searchParams.get("storeId") || (await getActiveStoreId())
    );
    if (!storeId) {
      return NextResponse.json({ customers: [] });
    }

    await assertStoreAccess(user, storeId);

    const sales = await prisma.sale.findMany({
      where: {
        storeId,
        status: "COMPLETED",
        OR: [
          { customerEmail: { not: null } },
          { customerPhone: { not: null } },
          { customerName: { not: null } },
        ],
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    type CustomerRow = {
      customerKey: string;
      customerName: string | null;
      customerEmail: string | null;
      customerPhone: string | null;
      lastSaleAt: Date;
      lastSaleId: string;
      salesCount: number;
      totalSpent: number;
    };

    const byKey = new Map<string, CustomerRow>();

    for (const sale of sales) {
      const email = sale.customerEmail ? normalizeEmail(sale.customerEmail) : null;
      const phone = sale.customerPhone ? sale.customerPhone.trim() : null;
      const name = sale.customerName ? sale.customerName.trim() : null;

      const key = email
        ? `email:${email}`
        : phone
          ? `phone:${phone}`
          : name
            ? `name:${name.toLowerCase()}`
            : null;
      if (!key) continue;

      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          customerKey: key,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          lastSaleAt: sale.createdAt,
          lastSaleId: sale.id,
          salesCount: 1,
          totalSpent: sale.total,
        });
      } else {
        existing.salesCount += 1;
        existing.totalSpent += sale.total;
      }
    }

    const customers = Array.from(byKey.values()).sort(
      (a, b) => b.lastSaleAt.getTime() - a.lastSaleAt.getTime()
    );

    return NextResponse.json({ customers });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load customers" }, { status: 500 });
  }
}

