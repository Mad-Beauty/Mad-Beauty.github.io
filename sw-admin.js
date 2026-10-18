/* =====================================================================
   Service worker SOLO del panel de la manicurista.
   - Guarda los archivos de la app para que abra rápido.
   - Los datos (citas, servicios) SIEMPRE se piden en vivo a Supabase:
     nunca se guardan aquí, así que no se ven citas viejas.
   - La página de las clientas no pasa por aquí.
   ===================================================================== */

const VERSION = "panel-v8";                 // súbele el número cuando cambies archivos
const SHELL = [
  "./admin.html",
  "./css/styles.css",
  "./js/common.js",
  "./js/admin.js",
  "./config.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // Supabase, fuentes, CDN: directo a internet

  // Primero internet (para ver siempre la última versión); si no hay conexión, lo guardado
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("./admin.html")))
  );
});

/* ---------------- Notificaciones push ---------------- */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Mad Beauty", {
    body: d.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/favicon-32.png",
    tag: d.tag || "cita",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: d.url || "./admin.html" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./admin.html", self.registration.scope).href;
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if (c.url.split("#")[0] === url.split("#")[0] && "focus" in c) return c.focus();
      return clients.openWindow(url);
    })
  );
});
