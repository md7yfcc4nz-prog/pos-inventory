import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin, requireUser } from "@/lib/auth";
import { slugifyCategoryKey } from "@/lib/categories";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET() {
  try {
    await requireUser();
    const categories = await prisma.productCategory.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ categories }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  requiresExpiry: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid category data" }, { status: 400 });
    }

    const name = parsed.data.name.trim();
    let key = slugifyCategoryKey(name);

    const existingActiveName = await prisma.productCategory.findFirst({
      where: { name, archivedAt: null },
    });
    if (existingActiveName) {
      return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
    }

    const existingKey = await prisma.productCategory.findUnique({ where: { key } });
    if (existingKey) {
      if (!existingKey.archivedAt) {
        return NextResponse.json({ error: "A category with that key already exists" }, { status: 409 });
      }
      key = `${key}_${Date.now().toString(36).toUpperCase()}`;
    }

    const category = await prisma.productCategory.create({
      data: {
        name,
        key,
        requiresExpiry: parsed.data.requiresExpiry,
      },
    });

    return NextResponse.json({ category }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
