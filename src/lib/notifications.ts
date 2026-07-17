const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_ADMIN_EMAIL = "depotpharmaima@gmail.com";

type Notification = {
  subject: string;
  text: string;
};

export async function sendAdminNotification({
  subject,
  text,
}: Notification): Promise<boolean> {
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
