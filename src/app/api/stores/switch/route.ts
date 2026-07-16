import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthError,
  assertStoreAccess,
  requireUser,
} from "@/lib/auth";

const schema = z.object({
  storeId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Store ID required" }, { status: 400 });
    }

    await assertStoreAccess(user, parsed.data.storeId);

    const response = NextResponse.json({ storeId: parsed.data.storeId });
    response.cookies.set("pos_store", parsed.data.storeId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to switch store" }, { status: 500 });
  }
}
