/**
 * Zet de loopstukken van een rit op een rij, om ze naast 9292 te kunnen leggen.
 *
 * Waarom dit bestaat: onze reistijden komen van MOTIS/transitous, waarvan de
 * looproutes uit OpenStreetMap komen. 9292 gebruikt een andere kaart en een
 * andere loopsnelheid. Waar het verschil zit is per rit anders, en één rit
 * vergelijken zegt niets over de rest. Dit script draait een lijstje ritten en
 * drukt precies af wat er in een 9292-schermafbeelding staat — meters en
 * minuten per loopstuk — zodat je ze naast elkaar kunt leggen zonder te tellen.
 *
 * Draaien met netwerk:
 *
 *   node scripts/loop-vergelijking.mjs                 # het vaste lijstje
 *   node scripts/loop-vergelijking.mjs "van" "naar"    # één eigen rit
 *
 * De tijd is standaard morgenochtend 08:00; met een derde argument kies je
 * zelf (bv. 2026-09-11T17:00).
 */

const MOTIS = process.env.MOTIS_BASE_URL?.replace(/\/$/, "") ?? "https://api.transitous.org";
const PDOK =
  process.env.PDOK_BASE_URL?.replace(/\/$/, "") ??
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const AGENT = process.env.NOMINATIM_USER_AGENT?.trim() || "VertrektijdAgenda/dev (loop-vergelijking)";

/**
 * Dezelfde waarden als `src/lib/transitQuery.ts` opbouwt. Wijkt dit af, dan
 * meet je iets anders dan wat de app doet en klopt de vergelijking niet.
 */
const WALK_SPEED_MS = 1.4;
const MAX_WALK_SECONDS = 20 * 60;
const MAX_DIRECT_SECONDS = 45 * 60;

/** Een spreiding: stad, dorp, kort, lang, met en zonder trein. */
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

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": AGENT, Accept: "application/json" } });
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
  return { label: hit.weergavenaam, lat, lon };
}

async function plan(from, to, tijd) {
  const params = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
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
  return data.itineraries?.[0] ?? null;
}

const klok = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "??:??";

/**
 * Wat de app met dit loopstuk doet: hij rekent elk loopstuk na op de eigen
 * loopsnelheid, net als 9292. Zie `src/lib/walkTimes.ts` — hier alleen om te
 * laten zien welk getal de gebruiker te zien krijgt.
 */
function getoondeLooptijd(leg) {
  const seconden = leg.duration ?? 0;
  if (typeof leg.distance !== "number" || leg.distance <= 0) return seconden;
  return Math.min(seconden, Math.ceil(leg.distance / WALK_SPEED_MS / 60) * 60);
}

async function toon(vanTekst, naarTekst, tijd) {
  const [van, naar] = await Promise.all([geocode(vanTekst), geocode(naarTekst)]);
  const rit = await plan(van, naar, tijd);
  if (!rit) {
    console.log(`\n${vanTekst} → ${naarTekst}\n  (geen OV-rit gevonden)`);
    return null;
  }

  const legs = rit.legs ?? [];
  let loopMeters = 0;
  let loopSeconden = 0;
  const regels = [];

  for (const leg of legs) {
    if ((leg.mode ?? "").toUpperCase() === "WALK") {
      const seconden = getoondeLooptijd(leg);
      const meters = Math.round(leg.distance ?? 0);
      loopMeters += meters;
      loopSeconden += seconden;
      const kmh = seconden > 0 ? ((meters / seconden) * 3.6).toFixed(1) : "-";
      regels.push(`    lopen  ${String(meters).padStart(4)} m  ${String(Math.round(seconden / 60)).padStart(2)} min   (${kmh} km/h)`);
    } else {
      regels.push(
        `    ${(leg.routeShortName ?? leg.mode ?? "?").padEnd(9)} ${klok(leg.startTime)} → ${klok(leg.endTime)}   ${leg.from?.name ?? "?"} → ${leg.to?.name ?? "?"}`,
      );
    }
  }

  // Alleen de twee uiteinden maken de reis korter: een kortere overstap levert
  // wachttijd op, geen tijdwinst. Zie de uitleg in `src/lib/walkTimes.ts`.
  const uiteinden = legs.length > 1 ? [legs[0], legs.at(-1)] : [legs[0]];
  const winst = uiteinden
    .filter((leg) => (leg?.mode ?? "").toUpperCase() === "WALK")
    .reduce((som, leg) => som + ((leg.duration ?? 0) - getoondeLooptijd(leg)), 0);
  const gecorrigeerd = Math.round(((rit.duration ?? 0) - winst) / 60);
  console.log(`\n${vanTekst} → ${naarTekst}`);
  console.log(`  ${klok(rit.startTime)} → ${klok(rit.endTime)}   ${gecorrigeerd} min, ${rit.transfers ?? 0} overstap(pen)`);
  for (const regel of regels) console.log(regel);
  console.log(`    totaal lopen: ${loopMeters} m in ${Math.round(loopSeconden / 60)} min`);
  return { totaal: gecorrigeerd, loopMeters, loopMinuten: Math.round(loopSeconden / 60) };
}

const [, , vanArg, naarArg, tijdArg] = process.argv;
const morgen = new Date();
morgen.setDate(morgen.getDate() + 1);
morgen.setHours(8, 0, 0, 0);
const TIJD = tijdArg ? new Date(tijdArg) : morgen;

console.log(`Vertrek vanaf ${TIJD.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`);
console.log("Leg deze getallen naast dezelfde rit in 9292: meters en minuten per loopstuk.");

const lijst = vanArg && naarArg ? [[vanArg, naarArg]] : RITTEN;
const uitkomsten = [];
for (const [van, naar] of lijst) {
  try {
    const uit = await toon(van, naar, TIJD);
    if (uit) uitkomsten.push(uit);
  } catch (error) {
    console.log(`\n${van} → ${naar}\n  (mislukt: ${error.message})`);
  }
}

if (uitkomsten.length > 1) {
  const meters = uitkomsten.reduce((s, u) => s + u.loopMeters, 0);
  const minuten = uitkomsten.reduce((s, u) => s + u.loopMinuten, 0);
  console.log(
    `\nOver ${uitkomsten.length} ritten: ${meters} m lopen in ${minuten} min ` +
      `(gemiddeld ${((meters / (minuten * 60)) * 3.6).toFixed(1)} km/h).`,
  );
}
