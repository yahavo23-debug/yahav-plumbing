// יהב אינסטלציה — Service Worker for Push Notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "יהב אינסטלציה", body: event.data.text() };
  }

  const options = {
    body:    payload.body  || "",
    icon:    payload.icon  || "/favicon.ico",
    badge:   payload.badge || "/favicon.ico",
    dir:     "rtl",
    lang:    "he",
    vibrate: [200, 100, 200],
    tag:     payload.tag   || "yahav-notification",
    data:    { url: payload.url || "/" },
    actions: payload.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "יהב אינסטלציה", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
