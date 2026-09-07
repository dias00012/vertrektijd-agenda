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
 *
 * De pagina's van de app staan in de voorlaadlijst. Zonder dat kwamen ze daar
 * alleen in als je ze ooit met een harde paginalading had geopend: binnen de
 * app wisselt een tab namelijk zonder echte navigatie, en dan ziet deze worker
 * er niets van. Wie zijn agenda altijd via het menu opende, kreeg zonder bereik
 * dus de offline-pagina te zien terwijl zijn gegevens gewoon op het apparaat
 * stonden.
 */

// Ophogen zodra de voorgeladen bestanden veranderen; oude caches worden dan
// opgeruimd bij het activeren.
const VERSION = "v4";
const SHELL_CACHE = `vertrektijd-shell-${VERSION}`;
const PAGE_CACHE = `vertrektijd-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

/** De schermen van de app; gelijk aan het menu in AppShell. */
const ROUTES = ["/", "/agenda", "/reizen", "/schoolwerk", "/instellingen"];

const SHELL_FILES = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon.svg",
  // Zonder deze staat er een leeg vlak op je beginscherm als je de app
  // installeert terwijl je geen bereik hebt.
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

/**
 * Eén voor één voorladen in plaats van in één keer.
 *
 * `cache.addAll` is alles-of-niets: mislukte er één van de zes, dan werd er
 * niets bewaard, en omdat de browser deze worker pas opnieuw installeert als
 * het bestand zelf verandert bleef die lege cache staan. Zo houdt een hapering
 * bij één bestand de rest niet tegen.
 */
async function precache(cache, urls) {
  await Promise.allSettled(urls.map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await precache(shell, SHELL_FILES);
      const pages = await caches.open(PAGE_CACHE);
      await precache(pages, ROUTES);
      await self.skipWaiting();
    })(),
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
      .then(async () => {
        // Ontbreekt de offline-pagina alsnog (een hapering bij het
        // installeren), dan hem nu alsnog halen: hij is het laatste redmiddel.
        const cache = await caches.open(SHELL_CACHE);
        if (!(await cache.match(OFFLINE_URL))) {
          await cache.add(OFFLINE_URL).catch(() => undefined);
        }
        await self.clients.claim();
      }),
  );
});

/**
 * Mag dit antwoord de cache in?
 *
 * Zonder deze controle belandde een 404 tijdens een uitrol, een 502, of — heel
 * gewoon op schoolwifi — de inlogpagina van een captive portal (status 200, maar
 * HTML in plaats van JavaScript) in de cache. Voor de gebouwde bestanden is de
 * strategie cache-first zonder hercontrole, dus dat bleef staan tot de volgende
 * versie: de app deed het daarna gewoon niet meer.
 */
function worthCaching(response) {
  return Boolean(response) && response.ok && response.status === 200 && response.type === "basic";
}

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
            if (!worthCaching(response)) return response;
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
          if (!worthCaching(response)) return response;
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
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      // Staat de app al open, dan die naar voren halen én naar het
      // dagoverzicht sturen. Alleen focussen liet je kijken naar welk scherm er
      // toevallig openstond, terwijl je op een vertrekmelding tikte.
      for (const client of clients) {
        const focused = await client.focus();
        if ("navigate" in client) await client.navigate("/").catch(() => undefined);
        return focused;
      }
      return self.clients.openWindow("/");
    }),
  );
});
