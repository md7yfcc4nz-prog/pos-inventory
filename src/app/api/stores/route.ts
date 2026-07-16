import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin, requireUser, getAccessibleStores } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const stores = await getAccessibleStores(user);
    return NextResponse.json({ stores });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load stores" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid store data" }, { status: 400 });
    }

    const store = await prisma.store.create({
      data: {
        name: parsed.data.name,
        address: parsed.data.address || null,
      },
    });

    return NextResponse.json({ store }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create store" }, { status: 500 });
  }
}
