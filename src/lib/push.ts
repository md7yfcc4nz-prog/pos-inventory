import webpush from "web-push";
import { prisma } from "@/lib/db";

type PushAlert = {
  title: string;
  body: string;
  url?: string;
};

export async function sendAdminPush(alert: PushAlert) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("Push notification skipped: VAPID keys are not configured");
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:depotpharmaima@gmail.com",
    publicKey,
    privateKey
  );

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { role: "ADMIN" } },
  });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: alert.title,
            body: alert.body,
            url: alert.url || "/",
          })
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({
            where: { id: subscription.id },
          }).catch(() => undefined);
          return;
        }
        console.error("Push notification failed:", error);
      }
    })
  );
}
