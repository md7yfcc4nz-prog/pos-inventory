import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

const updateSchema = z.object({
  id: z.string().optional(),
  all: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { readAt: null } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success || (!parsed.data.id && !parsed.data.all)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const readAt = new Date();
    if (parsed.data.all) {
      await prisma.notification.updateMany({
        where: { readAt: null },
        data: { readAt },
      });
    } else if (parsed.data.id) {
      await prisma.notification.update({
        where: { id: parsed.data.id },
        data: { readAt },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await prisma.notification.deleteMany();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}
