const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_ADMIN_EMAIL = "depotpharmaima@gmail.com";
const DEFAULT_ADMIN_SMS = "+12693669566";

type Notification = {
  subject: string;
  text: string;
};

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

type SmsPayload = {
  to: string;
  body: string;
};

export type ReceiptSale = {
  id: string;
  total: number;
  paymentMethod: string;
  createdAt: Date | string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  store: { name: string };
  cashier: { name: string };
  items: Array<{
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    product: { name: string };
  }>;
};

function formatMoney(amount: number) {
  return `${Math.round(amount).toLocaleString("fr-FR")} FCFA`;
}

async function sendEmail({ to, subject, text }: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Email notification skipped: RESEND_API_KEY is not configured");
    return false;
  }

  const from = process.env.EMAIL_FROM || "Kasuwa Manager <onboarding@resend.dev>";

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      console.error("Email notification failed:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Email notification failed:", error);
    return false;
  }
}

async function sendSms({ to, body }: SmsPayload): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.warn("SMS notification skipped: Twilio credentials are not configured");
    return false;
  }

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams({
      To: to,
      From: from,
      Body: body.length > 480 ? `${body.slice(0, 477)}...` : body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      console.error("SMS notification failed:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("SMS notification failed:", error);
    return false;
  }
}

async function sendAdminEmail({ subject, text }: Notification): Promise<boolean> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_EMAIL;
  return sendEmail({ to, subject, text });
}

function buildSmsBody({ subject, text }: Notification) {
  const compact = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" · ");
  const body = `Kasuwa Manager: ${subject}\n${compact}`;
  return body.length > 480 ? `${body.slice(0, 477)}...` : body;
}

async function sendAdminSms({ subject, text }: Notification): Promise<boolean> {
  const to = process.env.ADMIN_SMS_TO || DEFAULT_ADMIN_SMS;
  return sendSms({ to, body: buildSmsBody({ subject, text }) });
}

export async function sendAdminNotification({
  subject,
  text,
}: Notification): Promise<boolean> {
  const results = await Promise.all([
    sendAdminEmail({ subject, text }),
    sendAdminSms({ subject, text }),
  ]);
  return results.some(Boolean);
}

export function buildReceiptText(sale: ReceiptSale) {
  const date =
    typeof sale.createdAt === "string"
      ? new Date(sale.createdAt)
      : sale.createdAt;
  const lines = [
    "Kasuwa Manager receipt",
    `Store: ${sale.store.name}`,
    `Date: ${date.toLocaleString()}`,
    `Cashier: ${sale.cashier.name}`,
    `Payment: ${sale.paymentMethod}`,
    sale.customerName ? `Customer: ${sale.customerName}` : null,
    "",
    ...sale.items.map(
      (item) =>
        `${item.product.name} ×${item.quantity} @ ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}`
    ),
    "",
    `Total: ${formatMoney(sale.total)}`,
    `Sale ID: ${sale.id}`,
    "Thank you for shopping with us.",
  ].filter((line) => line !== null) as string[];

  return lines.join("\n");
}

export async function sendCustomerReceipt(
  sale: ReceiptSale,
  options: { email?: boolean; sms?: boolean } = {}
): Promise<{ emailed: boolean; smsed: boolean }> {
  const text = buildReceiptText(sale);
  const subject = `Your receipt from ${sale.store.name} — ${formatMoney(sale.total)}`;
  const wantEmail = options.email !== false && Boolean(sale.customerEmail);
  const wantSms = options.sms !== false && Boolean(sale.customerPhone);

  const [emailed, smsed] = await Promise.all([
    wantEmail && sale.customerEmail
      ? sendEmail({ to: sale.customerEmail, subject, text })
      : Promise.resolve(false),
    wantSms && sale.customerPhone
      ? sendSms({
          to: sale.customerPhone,
          body: `Kasuwa Manager receipt\n${sale.store.name}\nTotal: ${formatMoney(sale.total)}\n${sale.items
            .map((item) => `${item.product.name}×${item.quantity}`)
            .join(", ")}`,
        })
      : Promise.resolve(false),
  ]);

  return { emailed, smsed };
}
