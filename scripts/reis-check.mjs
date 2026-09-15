/**
 * Kijkt wat de reisplanner (MOTIS/transitous) echt teruggeeft voor een rit.
 *
 * De app zelf laat alleen het eindresultaat zien; dit script laat de kale
 * antwoorden zien, zodat te zien is of een bus wel of niet in de gegevens zit.
 * Draaien met netwerk: node scripts/reis-check.mjs "van" "naar" [tijd]
 *
 *   node scripts/reis-check.mjs "Gran Canariastraat 60, Almere" \
 *     "Donaustraat 184, Lelystad" 2026-09-07T06:00
 *
 * Zonder argumenten pakt hij het voorbeeld hierboven.
 */

const MOTIS = process.env.MOTIS_BASE_URL?.replace(/\/$/, "") ?? "https://api.transitous.org";
const NOMINATIM =
  process.env.NOMINATIM_BASE_URL?.replace(/\/$/, "") ?? "https://nominatim.openstreetmap.org";
const AGENT =
  process.env.NOMINATIM_USER_AGENT?.trim() || "VertrektijdAgenda/dev (reis-check)";

const [, , fromArg, toArg, timeArg] = process.argv;
const FROM = fromArg ?? "Gran Canariastraat 60, Almere";
const TO = toArg ?? "Donaustraat 184, Lelystad";
const TIME = timeArg ? new Date(timeArg) : new Date();

async function get(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": AGENT, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return response.json();
}

/** Adres naar coordinaten, net als de app doet. */
async function geocode(query) {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "nl,be,de");
  const [hit] = await get(url.toString());
  if (!hit) throw new Error(`Niets gevonden voor "${query}"`);
  return { label: hit.display_name, lat: Number(hit.lat), lon: Number(hit.lon) };
}

function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "??:??";
}

function describe(leg) {
  const minutes = Math.round((leg.duration ?? 0) / 60);
  const vehicle = leg.routeShortName
    ? `${leg.mode} ${leg.routeShortName}${leg.headsign ? ` → ${leg.headsign}` : ""}`
    : leg.mode;
  return `      ${clock(leg.startTime)}-${clock(leg.endTime)} ${String(minutes).padStart(3)}m  ${vehicle}\n` +
    `          ${leg.from?.name ?? "?"} → ${leg.to?.name ?? "?"}`;
}

/** De planversies die MOTIS kent; v6 is de huidige, v1 de oude. */
const PLAN_VERSIONS = ["v6", "v1"];

/** Dezelfde parameters als src/lib/transitQuery.ts opbouwt. */
async function plan(from, to, extra = {}, version = PLAN_VERSIONS[0]) {
  const params = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
    time: TIME.toISOString(),
    arriveBy: "false",
    numItineraries: "5",
    preTransitModes: "WALK",
    maxPreTransitTime: String(20 * 60),
    postTransitModes: "WALK",
    maxPostTransitTime: String(20 * 60),
    maxDirectTime: String(45 * 60),
    useRoutedTransfers: "true",
    ...extra,
  });
  return get(`${MOTIS}/api/${version}/plan?${params}`);
}

/** Wat kan deze server? Zegt onder meer of overstappen over straat kan. */
async function serverConfig() {
  try {
    const health = await get(`${MOTIS}/api/v1/health`);
    console.log("\n=== Wat de planner-server aankan ===");
    for (const [key, value] of Object.entries(health)) {
      if (typeof value !== "object") console.log(`  ${key}: ${value}`);
    }
  } catch (error) {
    console.log("\n=== Wat de planner-server aankan ===\n  (niet op te vragen:", error.message, ")");
  }
}

function report(title, data) {
  console.log(`\n=== ${title} ===`);
  const list = data.itineraries ?? [];
  if (list.length === 0) {
    console.log("  (geen OV-opties)");
    return;
  }
  for (const trip of list) {
    const minutes = Math.round((trip.duration ?? 0) / 60);
    console.log(
      `\n  ${clock(trip.startTime)} → ${clock(trip.endTime)}  ${minutes} min, ` +
        `${trip.transfers ?? 0} overstap(pen)`,
    );
    for (const leg of trip.legs ?? []) console.log(describe(leg));
  }
}

/** Rijdt lijn 207 uberhaupt langs? Zo niet, dan ontbreken de gegevens. */
async function stopsNearby(text) {
  const found = await get(`${MOTIS}/api/v1/geocode?text=${encodeURIComponent(text)}`);
  console.log(`\n=== Haltes gevonden op "${text}" ===`);
  for (const item of found.slice(0, 5)) {
    console.log(`  ${item.type ?? "?"}  ${item.name}  (${item.lat}, ${item.lon})`);
  }
}

const from = await geocode(FROM);
const to = await geocode(TO);
console.log(`Van : ${from.label}\n      ${from.lat}, ${from.lon}`);
console.log(`Naar: ${to.label}\n      ${to.lat}, ${to.lon}`);
console.log(`Tijd: ${TIME.toISOString()}`);

await serverConfig();

// 1. Precies zoals de reisplanner in de app het nu vraagt.
report("Zoals de reisplanner het vraagt (v6)", await plan(from, to));

// 2. Zoals de agenda het vraagt: een klein venster waar de app zelf de beste
//    rit uit kiest (zo laat mogelijk weg, bij gelijkspel de kortste rit).
report("Zoals de agenda het vraagt (v6, drie opties)", await plan(from, to, { numItineraries: "3" }));

// 2b. Zoals de agenda het tot 0.34.0 vroeg: één rit, gekozen door de planner.
//     Bij "uiterlijk aankomen om" zit daar het wachten in dat je niet wilt.
report(
  "Zoals het tot 0.34.0 ging (timetableView=false)",
  await plan(from, to, { timetableView: "false", numItineraries: "1" }),
);

// 3. Zonder overstappen over straat: zo deed de app het tot nu toe. Staat de
//    snelle bus alleen in 1 en 2 en niet hier, dan was dát het probleem.
report(
  "Zonder overstappen over straat",
  await plan(from, to, { useRoutedTransfers: "false" }),
);

// 4. De oude versie van het endpoint, waar de app tot nu toe op zat.
report("Op de oude planversie (v1)", await plan(from, to, {}, "v1"));

// 5. Zonder grens op het laatste stuk lopen: staat de goede halte er dan wel
//    bij, dan lag het aan die grens.
report(
  "Met een half uur lopen toegestaan aan beide kanten",
  await plan(from, to, {
    maxPreTransitTime: String(30 * 60),
    maxPostTransitTime: String(30 * 60),
  }),
);

await stopsNearby("Palazzo, Lelystad");
await stopsNearby("Lelystad Centrum");
