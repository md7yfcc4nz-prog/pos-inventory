import { NextResponse } from "next/server";
import { getSession, getAccessibleStores, getActiveStoreId, resolveStoreId } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const stores = await getAccessibleStores(user);
  const storeId = await resolveStoreId(user, await getActiveStoreId());

  return NextResponse.json({
    user,
    stores,
    activeStoreId: storeId,
  });
}
