import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  AuthError,
  assertStoreAccess,
  getActiveStoreId,
  requireUser,
  resolveStoreId,
} from "@/lib/auth";

const expenseSchema = z.object({
  storeId: z.string().optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive(),
  incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const storeId = await resolveStoreId(
      user,
      request.nextUrl.searchParams.get("storeId") || (await getActiveStoreId())
    );
    if (!storeId) {
      return NextResponse.json({ expenses: [], total: 0 });
    }
    await assertStoreAccess(user, storeId);

    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    const expenses = await prisma.expense.findMany({
      where: { storeId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    const normalizedQuery = query.toLowerCase();
    const filtered =
      normalizedQuery.length === 0
        ? expenses
        : expenses.filter((expense) => {
            const amountText = String(Math.round(expense.amount));
            const dateText = expense.incurredAt.toISOString().slice(0, 10);
            return (
              expense.description.toLowerCase().includes(normalizedQuery) ||
              expense.createdBy.name.toLowerCase().includes(normalizedQuery) ||
              amountText.includes(normalizedQuery) ||
              dateText.includes(normalizedQuery)
            );
          });

    const total = filtered.reduce((sum, expense) => sum + expense.amount, 0);

    return NextResponse.json({ expenses: filtered, storeId, total, q: query });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid expense data" }, { status: 400 });
    }

    const storeId = await resolveStoreId(
      user,
      parsed.data.storeId || (await getActiveStoreId())
    );
    if (!storeId) {
      return NextResponse.json({ error: "No store available" }, { status: 400 });
    }
    await assertStoreAccess(user, storeId);

    const incurredAt = new Date(`${parsed.data.incurredAt}T12:00:00.000Z`);
    if (Number.isNaN(incurredAt.getTime())) {
      return NextResponse.json({ error: "Invalid expense date" }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: {
        storeId,
        createdById: user.id,
        description: parsed.data.description,
        amount: parsed.data.amount,
        incurredAt,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
