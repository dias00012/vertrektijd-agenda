/**
 * Legt onze reistijden naast die van Google Maps.
 *
 * Waarom: onze OV-gegevens komen uit dezelfde landelijke feed als die van
 * Google, dus de treinen en bussen horen exact gelijk te zijn. Wijken ze toch
 * af, dan zegt dat iets over hoe wij de rit kiezen. De looproutes komen wél uit
 * verschillende kaarten — bij ons OpenStreetMap, bij Google hun eigen kaart —
 * en juist daar zat het verschil met 9292. Dit script laat per loopstuk zien
 * hoeveel meter en hoeveel minuten beide kanten zeggen, zodat een structurele
 * afwijking meteen opvalt en een losse kaartfout niet voor een patroon wordt
 * aangezien.
 *
 * De sleutel komt uit de omgeving en staat nooit in de code of in de uitvoer:
 *
 *   GOOGLE_MAPS_API_KEY=... node scripts/vergelijk-google.mjs
 *   GOOGLE_MAPS_API_KEY=... node scripts/vergelijk-google.mjs "van" "naar"
 *
 * Een sleutel met alleen de Routes API is genoeg. Het vaste lijstje kost
 * acht aanvragen.
 */

const SLEUTEL = process.env.GOOGLE_MAPS_API_KEY?.trim();
const MOTIS = process.env.MOTIS_BASE_URL?.replace(/\/$/, "") ?? "https://api.transitous.org";
const PDOK =
  process.env.PDOK_BASE_URL?.replace(/\/$/, "") ??
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const AGENT = process.env.NOMINATIM_USER_AGENT?.trim() || "VertrektijdAgenda/dev (vergelijk-google)";

/** Dezelfde waarden als `src/lib/transitQuery.ts`; anders meet je iets anders. */
const WALK_SPEED_MS = 1.4;
const MAX_WALK_SECONDS = 20 * 60;
const MAX_DIRECT_SECONDS = 45 * 60;

const RITTEN = [
  ["Gran Canariastraat 60, Almere", "Donaustraat 184, Lelystad"],
  ["Gran Canariastraat 60, Almere", "Hospitaaldreef 5, Almere"],
  ["Gran Canariastraat 60, Almere", "Stationsplein 49, Utrecht"],
  ["Gran Canariastraat 60, Almere", "Evert van de Beekstraat 202, Schiphol"],
  ["Donaustraat 184, Lelystad", "Grote Markt 1, Zwolle"],
  ["Gran Canariastraat 60, Almere", "Kerkstraat 1, Marken"],
  ["Stationsplein 1, Amersfoort", "Neude 11, Utrecht"],
  ["Donaustraat 184, Lelystad", "Gran Canariastraat 60, Almere"],
];

async function get(url, opties = {}) {
  const response = await fetch(url, {
    headers: { "User-Agent": AGENT, Accept: "application/json" },
    ...opties,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/** Adres naar coordinaten via het Nederlandse adressenregister, net als de app. */
async function geocode(query) {
  const url = new URL(`${PDOK}/free`);
  url.searchParams.set("q", query);
  url.searchParams.set("rows", "1");
  url.searchParams.set("fq", "type:adres");
  const data = await get(url.toString());
  const hit = data?.response?.docs?.[0];
  if (!hit?.centroide_ll) throw new Error(`niets gevonden voor "${query}"`);
  const [lon, lat] = hit.centroide_ll.replace(/POINT\(|\)/g, "").split(" ").map(Number);
  return { lat, lon };
}

/* --- Onze kant ---------------------------------------------------------- */

/** Zie `src/lib/finalWalk.ts`: het laatste loopstuk rekent de app zelf na. */
function onzeLooptijd(leg, isLaatste) {
  const seconden = leg.duration ?? 0;
  if (!isLaatste || typeof leg.distance !== "number" || leg.distance <= 0) return seconden;
  const verwacht = leg.distance / WALK_SPEED_MS;
  if (seconden <= verwacht * 1.4) return seconden;
  return Math.min(seconden, Math.ceil((verwacht + 60) / 60) * 60);
}

async function onzeRit(van, naar, tijd) {
  const params = new URLSearchParams({
    fromPlace: `${van.lat},${van.lon}`,
    toPlace: `${naar.lat},${naar.lon}`,
    time: tijd.toISOString(),
    arriveBy: "false",
    numItineraries: "1",
    preTransitModes: "WALK",
    maxPreTransitTime: String(MAX_WALK_SECONDS),
    postTransitModes: "WALK",
    maxPostTransitTime: String(MAX_WALK_SECONDS),
    maxDirectTime: String(MAX_DIRECT_SECONDS),
    useRoutedTransfers: "true",
    pedestrianSpeed: String(WALK_SPEED_MS),
  });
  const data = await get(`${MOTIS}/api/v6/plan?${params}`);
  const rit = data.itineraries?.[0];
  if (!rit) return null;

  const legs = rit.legs ?? [];
  const laatste = legs.length - 1;
  let loopMeters = 0;
  let loopSeconden = 0;
  const lijnen = [];
  let gewonnen = 0;

  for (const [i, leg] of legs.entries()) {
    if ((leg.mode ?? "").toUpperCase() === "WALK") {
      const seconden = onzeLooptijd(leg, i === laatste);
      gewonnen += (leg.duration ?? 0) - seconden;
      loopMeters += Math.round(leg.distance ?? 0);
      loopSeconden += seconden;
    } else if (leg.routeShortName) {
      lijnen.push(leg.routeShortName);
    }
  }

  return {
    minuten: Math.round(((rit.duration ?? 0) - gewonnen) / 60),
    vertrek: rit.startTime,
    loopMeters,
    loopMinuten: Math.round(loopSeconden / 60),
    lijnen,
  };
}

/* --- Google ------------------------------------------------------------- */

/**
 * De Routes API, niet de oude Directions API: die laatste is bij Google
 * "legacy" en wordt voor nieuwe projecten niet meer aangezet.
 */
const VELDEN = [
  "routes.duration",
  "routes.legs.duration",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.transitDetails",
].join(",");

/** "1234s" -> 1234 */
function seconden(waarde) {
  const n = Number.parseFloat(String(waarde ?? "0").replace("s", ""));
  return Number.isFinite(n) ? n : 0;
}

async function googleRit(van, naar, tijd) {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": SLEUTEL,
      "X-Goog-FieldMask": VELDEN,
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: van.lat, longitude: van.lon } } },
      destination: { location: { latLng: { latitude: naar.lat, longitude: naar.lon } } },
      travelMode: "TRANSIT",
      departureTime: tijd.toISOString(),
      languageCode: "nl",
      regionCode: "NL",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    // De sleutel zelf komt nooit in de uitvoer terecht.
    throw new Error(`${response.status}: ${data?.error?.message ?? "geen toelichting"}`);
  }

  const route = data.routes?.[0];
  const leg = route?.legs?.[0];
  if (!leg) return null;

  let loopMeters = 0;
  let loopSeconden = 0;
  let vertrek = null;
  const lijnen = [];

  for (const stap of leg.steps ?? []) {
    if (stap.travelMode === "WALK") {
      loopMeters += stap.distanceMeters ?? 0;
      loopSeconden += seconden(stap.staticDuration);
    } else if (stap.transitDetails) {
      const lijn = stap.transitDetails.transitLine ?? {};
      lijnen.push(lijn.nameShort || lijn.name || "?");
      vertrek ??= stap.transitDetails.stopDetails?.departureTime ?? null;
    }
  }

  return {
    minuten: Math.round(seconden(route.duration ?? leg.duration) / 60),
    vertrek,
    loopMeters,
    loopMinuten: Math.round(loopSeconden / 60),
    lijnen,
  };
}

/* --- Naast elkaar ------------------------------------------------------- */

const klok = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "--:--";
const tempo = (m, min) => (min > 0 ? `${((m / (min * 60)) * 3.6).toFixed(1)} km/h` : "-");

if (!SLEUTEL) {
  console.error(
    "Geen sleutel gevonden. Zet GOOGLE_MAPS_API_KEY in de omgeving:\n" +
      "  GOOGLE_MAPS_API_KEY=... node scripts/vergelijk-google.mjs\n\n" +
      "Een sleutel met alleen de Routes API is genoeg.",
  );
  process.exit(1);
}

const [, , vanArg, naarArg, tijdArg] = process.argv;
const morgen = new Date();
morgen.setDate(morgen.getDate() + 1);
morgen.setHours(8, 0, 0, 0);
const TIJD = tijdArg ? new Date(tijdArg) : morgen;
const lijst = vanArg && naarArg ? [[vanArg, naarArg]] : RITTEN;

console.log(`Vertrek vanaf ${TIJD.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}\n`);

const verschillen = [];
for (const [vanTekst, naarTekst] of lijst) {
  console.log(`${vanTekst} → ${naarTekst}`);
  try {
    const [van, naar] = await Promise.all([geocode(vanTekst), geocode(naarTekst)]);
    const [onze, hunne] = await Promise.all([onzeRit(van, naar, TIJD), googleRit(van, naar, TIJD)]);

    if (!onze || !hunne) {
      console.log(`  ${!onze ? "wij" : "Google"} vindt geen rit\n`);
      continue;
    }

    console.log(
      `  onze app  ${klok(onze.vertrek)}  ${String(onze.minuten).padStart(3)} min   ` +
        `lopen ${String(onze.loopMeters).padStart(4)} m / ${String(onze.loopMinuten).padStart(2)} min (${tempo(onze.loopMeters, onze.loopMinuten)})   ` +
        `via ${onze.lijnen.join(", ") || "-"}`,
    );
    console.log(
      `  Google    ${klok(hunne.vertrek)}  ${String(hunne.minuten).padStart(3)} min   ` +
        `lopen ${String(hunne.loopMeters).padStart(4)} m / ${String(hunne.loopMinuten).padStart(2)} min (${tempo(hunne.loopMeters, hunne.loopMinuten)})   ` +
        `via ${hunne.lijnen.join(", ") || "-"}`,
    );

    const dMin = onze.minuten - hunne.minuten;
    const dMeters = onze.loopMeters - hunne.loopMeters;
    console.log(
      `  verschil  ${dMin >= 0 ? "+" : ""}${dMin} min totaal, ` +
        `${dMeters >= 0 ? "+" : ""}${dMeters} m lopen, ` +
        `${onze.lijnen.join(",") === hunne.lijnen.join(",") ? "zelfde lijnen" : "ANDERE LIJNEN"}\n`,
    );
    verschillen.push({ dMin, dMeters, zelfdeLijnen: onze.lijnen.join(",") === hunne.lijnen.join(",") });
  } catch (error) {
    console.log(`  mislukt: ${error.message}\n`);
  }
}

if (verschillen.length > 0) {
  const som = (f) => verschillen.reduce((s, v) => s + f(v), 0);
  const gem = (f) => (som(f) / verschillen.length).toFixed(1);
  const zelfde = verschillen.filter((v) => v.zelfdeLijnen).length;
  console.log(
    `Over ${verschillen.length} ritten: gemiddeld ${gem((v) => v.dMin)} min verschil ` +
      `(uitersten ${Math.min(...verschillen.map((v) => v.dMin))} en ${Math.max(...verschillen.map((v) => v.dMin))}), ` +
      `gemiddeld ${gem((v) => v.dMeters)} m meer lopen, ` +
      `${zelfde} van de ${verschillen.length} met dezelfde lijnen.`,
  );
  console.log(
    "\nEen vaste plus of min over alle ritten wijst op iets in ons model. " +
      "Losse uitschieters wijzen op een plek in de kaart; zie KAARTFOUTEN.md.",
  );
}
