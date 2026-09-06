/*
 * Service worker: zorgt dat de app ook zonder bereik opent.
 *
 * Waarom dit uitmaakt: dit is een reis-app. Juist in de trein, in een tunnel of
 * op een station met slecht bereik wil je zien hoe laat je moet vertrekken. Je
 * agenda staat al in je browser-opslag; het enige wat ontbrak was de app zelf.
 *
 * Drie regels:
 *  - /api/*        nooit uit de cache. Verouderde reistijden zijn erger dan geen.
 *  - /_next/static hashed bestanden, dus veilig cache-first en voor altijd geldig.
 *  - pagina's      eerst het netwerk (verse code), anders de cache, anders offline.
 */

// Ophogen zodra de voorgeladen bestanden veranderen; oude caches worden dan
// opgeruimd bij het activeren.
const VERSION = "v3";
const SHELL_CACHE = `vertrektijd-shell-${VERSION}`;
const PAGE_CACHE = `vertrektijd-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll([
          OFFLINE_URL,
          "/manifest.webmanifest",
          "/icon.svg",
          // Zonder deze staat er een leeg vlak op je beginscherm als je de app
          // installeert terwijl je geen bereik hebt.
          "/icon-192.png",
          "/icon-512.png",
          "/apple-touch-icon.png",
        ]),
      )
      // Lukt het voorladen niet, dan is de app nog steeds bruikbaar; installeer door.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("vertrektijd-") && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Gebouwde bestanden hebben een hash in hun naam: verandert de inhoud, dan
  // verandert de URL. Cache-first is daar dus altijd correct.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline ?? Response.error();
        }),
    );
  }
});

/*
 * Meldingen terwijl de app dicht is.
 *
 * De server stuurt niet meer dan een titel en een zin: hij weet niet waar je
 * heen gaat. Alles wat hier gebeurt is dat tonen, en bij een tik de app openen
 * op het dagoverzicht.
 */
self.addEventListener("push", (event) => {
  let message = { title: "Vertrektijd", body: "" };
  try {
    if (event.data) message = { ...message, ...event.data.json() };
  } catch {
    // Onleesbare inhoud: dan liever een kale melding dan helemaal niets, want
    // de browser eist dat er iets getoond wordt.
  }

  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Eén melding tegelijk over vertrekken: een nieuwe vervangt de oude.
      tag: "vertrektijd-reminder",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Staat de app al open, dan die naar voren halen in plaats van een
      // tweede venster openen.
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) return client.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
