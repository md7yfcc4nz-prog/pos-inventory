import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/auth";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function GET() {
  try {
    await requireAdmin();
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
    }
    return NextResponse.json({ publicKey });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load push settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = subscriptionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userId: admin.id,
      },
      update: {
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userId: admin.id,
      },
    });
    return NextResponse.json({ subscription: { id: subscription.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to save push subscription" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = z.object({ endpoint: z.string().url() }).safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: admin.id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to remove push subscription" }, { status: 500 });
  }
}
