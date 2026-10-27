/* =====================================================================
   Service worker de la página de clientas: SOLO recibe los recordatorios
   de cita. No guarda archivos ni intercepta la navegación, así que la
   página sigue siendo una página web normal (no una app).
   ===================================================================== */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Recordatorio de tu cita", {
    body: d.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/favicon-32.png",
    tag: d.tag || "recordatorio",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if (c.url.split("#")[0].split("?")[0] === url && "focus" in c) return c.focus();
      return clients.openWindow(url);
    })
  );
});
