import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";
import { Category } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  requiresExpiry: z.boolean().optional(),
});

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

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

    return NextResponse.json({ category }, { headers: noStoreHeaders });
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

    if (existing.key === Category.OTHER) {
      return NextResponse.json(
        { error: "The Other category cannot be deleted" },
        { status: 400 }
      );
    }

    const fallback = await prisma.productCategory.findFirst({
      where: { key: Category.OTHER, archivedAt: null },
    });
    if (!fallback) {
      return NextResponse.json(
        { error: "Fallback Other category is missing" },
        { status: 500 }
      );
    }

    const stamp = Date.now().toString(36).toUpperCase();
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { category: existing.key, archivedAt: null },
        data: { category: fallback.key },
      }),
      prisma.productCategory.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          // Free unique name/key so the same category can be recreated later.
          key: `${existing.key}__ARCHIVED_${stamp}`,
          name: `${existing.name} (archived ${stamp})`,
        },
      }),
    ]);

    return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
