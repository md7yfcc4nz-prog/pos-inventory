self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (windows.some((client) => client.visibilityState === "visible")) {
        return;
      }

      const data = event.data?.json() || {};
      await self.registration.showNotification(data.title || "Kasuwa Manager", {
        body: data.body || "You have a new alert.",
        icon: "/logo.png",
        badge: "/logo.png",
        data: { url: data.url || "/" },
        tag: data.tag || "kasuwa-alert",
        renotify: true,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
