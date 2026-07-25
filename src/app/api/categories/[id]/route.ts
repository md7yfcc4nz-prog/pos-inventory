import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  requiresExpiry: z.boolean().optional(),
});

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid category data" }, { status: 400 });
    }

    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing || existing.archivedAt) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const category = await prisma.productCategory.update({
      where: { id },
      data: {
        name: parsed.data.name?.trim(),
        requiresExpiry: parsed.data.requiresExpiry,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing || existing.archivedAt) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const inUse = await prisma.product.count({
      where: { category: existing.key, archivedAt: null },
    });
    if (inUse > 0) {
      return NextResponse.json(
        { error: "Category is used by products. Reassign products first." },
        { status: 409 }
      );
    }

    await prisma.productCategory.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
