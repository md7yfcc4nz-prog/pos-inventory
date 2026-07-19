const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_ADMIN_EMAIL = "depotpharmaima@gmail.com";
const DEFAULT_ADMIN_SMS = "+12693669566";

type Notification = {
  subject: string;
  text: string;
};

async function sendAdminEmail({ subject, text }: Notification): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Email notification skipped: RESEND_API_KEY is not configured");
    return false;
  }

  const to = process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_EMAIL;
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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.ADMIN_SMS_TO || DEFAULT_ADMIN_SMS;

  if (!accountSid || !authToken || !from) {
    console.warn("SMS notification skipped: Twilio credentials are not configured");
    return false;
  }

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams({
      To: to,
      From: from,
      Body: buildSmsBody({ subject, text }),
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
