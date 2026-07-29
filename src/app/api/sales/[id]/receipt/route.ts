import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendCustomerReceipt } from "@/lib/notifications";
import {
  AuthError,
  assertStoreAccess,
  requireUser,
} from "@/lib/auth";

const schema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  customerEmail: z.string().trim().max(120).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid receipt request" }, { status: 400 });
    }

    const existing = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        cashier: { select: { name: true } },
        store: { select: { name: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }
    await assertStoreAccess(user, existing.storeId);

    const customerName =
      parsed.data.customerName !== undefined
        ? parsed.data.customerName || null
        : existing.customerName;
    const customerPhone =
      parsed.data.customerPhone !== undefined
        ? parsed.data.customerPhone || null
        : existing.customerPhone;
    const customerEmail =
      parsed.data.customerEmail !== undefined
        ? parsed.data.customerEmail || null
        : existing.customerEmail;

    const sale =
      customerName !== existing.customerName ||
      customerPhone !== existing.customerPhone ||
      customerEmail !== existing.customerEmail
        ? await prisma.sale.update({
            where: { id },
            data: { customerName, customerPhone, customerEmail },
            include: {
              items: { include: { product: true } },
              cashier: { select: { name: true } },
              store: { select: { name: true } },
            },
          })
        : existing;

    const wantEmail = parsed.data.email !== false;
    const wantSms = parsed.data.sms !== false;
    if ((wantEmail && !sale.customerEmail) || (wantSms && !sale.customerPhone)) {
      if (!sale.customerEmail && !sale.customerPhone) {
        return NextResponse.json(
          { error: "Add a customer email or phone number before sending a receipt" },
          { status: 400 }
        );
      }
    }

    const receipt = await sendCustomerReceipt(sale, {
      email: wantEmail,
      sms: wantSms,
    });

    if (!receipt.emailed && !receipt.smsed) {
      const reason =
        receipt.emailError ||
        receipt.smsError ||
        "Could not send the receipt. Check customer contact details and email/SMS settings.";
      return NextResponse.json(
        {
          error: reason,
          receipt,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, receipt, sale });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to send receipt" }, { status: 500 });
  }
}
