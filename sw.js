/**
 * MedPred CRM — Service Worker (GitHub Pages subpath-safe)
 * - App Shell (HTML/CSS/JS/PNG): Network-first + Cache fallback
 * - Supabase API: Faqat Network (jonli tibbiy/moliyaviy ma'lumotlar keshlanmaydi)
 */
const CACHE_NAME = "medpred-crm-v1.1.0";

const SHELL_PATHS = [
  "index.html",
  "login.html",
  "dashboard.html",
  "manifest.webmanifest",
  "assets/css/main.css",
  "assets/css/components.css",
  "assets/css/responsive.css",
  "assets/js/config.js",
  "assets/js/supabase.js",
  "assets/js/permissions.js",
  "assets/js/auth.js",
  "assets/js/pwa.js",
  "assets/js/dashboard.js",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
  "assets/img/apple-touch-icon.png",
  "pages/reception.html",
  "pages/patients.html",
  "pages/doctors.html",
  "pages/medpreds.html",
  "pages/organizations.html",
  "pages/visits.html",
  "pages/services.html",
  "pages/payments.html",
  "pages/reports.html",
  "pages/imports.html",
  "pages/users.html",
  "pages/settings.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const base = self.registration.scope;
      return Promise.allSettled(
        SHELL_PATHS.map((p) => cache.add(new URL(p, base).toString()))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Supabase API so'rovlarini hech qachon keshlamaslik
  if (url.hostname.includes("supabase.co") || url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/")) {
    return;
  }

  // Faqat shu origin (GitHub Pages / localhost) fayllarini keshlash
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match(new URL("index.html", self.registration.scope).toString())))
  );
});
