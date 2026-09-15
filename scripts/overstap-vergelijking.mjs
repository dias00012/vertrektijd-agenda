/**
 * Overstappen: de overstaptijd uit de dienstregeling, of een looproute over de
 * straat?
 *
 * MOTIS kan het allebei (`useRoutedTransfers`). Over de straat berekenen klinkt
 * nauwkeuriger, maar loopt over dezelfde OpenStreetMap-kaart die te traag
 * rekent (zie `src/lib/walkTimes.ts`): een overstap die je in het echt haalt,
 * ziet er dan te krap uit, en dan pakt de planner een latere trein. Dat kost
 * geen seconden maar kwartieren, en het valt niet op — er staat gewoon een
 * geloofwaardige, te lange reis.
 *
 * Dit script legt beide standen naast elkaar: 12 ritten op 4 tijdstippen, van
 * elke stand de vroegste aankomst, want dat is dezelfde vraag. De uitkomst die
 * de keuze in `src/lib/transitQuery.ts` onderbouwt:
 *
 *     gelijk                           28
 *     overstaptijd uit de feed sneller 20  (samen 106 minuten)
 *     over de straat berekend sneller   0
 *
 * Draaien met netwerk:
 *
 *   node scripts/overstap-vergelijking.mjs
 */

const MOTIS = "https://api.transitous.org";
const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const AGENT = "VertrektijdAgenda/dev (overstap)";
const SPEED = 1.4;

const RITTEN = [
  ["Gran Canariastraat 60, Almere", "Donaustraat 184, Lelystad"],
  ["Gran Canariastraat 60, Almere", "Stationsplein 49, Utrecht"],
  ["Gran Canariastraat 60, Almere", "Evert van de Beekstraat 202, Schiphol"],
  ["Donaustraat 184, Lelystad", "Grote Markt 1, Zwolle"],
  ["Gran Canariastraat 60, Almere", "Kerkstraat 1, Marken"],
  ["Kalverstraat 1, Amsterdam", "Coolsingel 40, Rotterdam"],
  ["Grote Markt 1, Haarlem", "Vredenburg 40, Utrecht"],
  ["Markt 1, Den Bosch", "Grote Markt 1, Groningen"],
  ["Vrijthof 1, Maastricht", "Markt 1, Eindhoven"],
  ["Stationsplein 1, Leiden", "Grote Markt 1, Den Haag"],
  ["Oude Markt 24, Enschede", "Stationsplein 1, Deventer"],
  ["Havenplein 1, Zierikzee", "Markt 1, Goes"],
];
const UREN = [7, 10, 15, 19];

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": AGENT, Accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function geocode(q) {
  const u = new URL(`${PDOK}/free`);
  u.searchParams.set("q", q); u.searchParams.set("rows", "1"); u.searchParams.set("fq", "type:adres");
  const h = (await get(u.toString()))?.response?.docs?.[0];
  if (!h?.centroide_ll) throw new Error("geen adres");
  const [lon, lat] = h.centroide_ll.replace(/POINT\(|\)/g, "").split(" ").map(Number);
  return { lat, lon };
}
function looptijd(leg) {
  const s = leg.duration ?? 0;
  if (typeof leg.distance !== "number" || leg.distance <= 0) return s;
  return Math.min(s, Math.ceil(leg.distance / SPEED / 60) * 60);
}
function getoond(rit) {
  const legs = rit.legs ?? [];
  const uiteinden = legs.length > 1 ? [legs[0], legs.at(-1)] : [legs[0]];
  const winst = uiteinden
    .filter((l) => (l?.mode ?? "").toUpperCase() === "WALK")
    .reduce((som, l) => som + ((l.duration ?? 0) - looptijd(l)), 0);
  return Math.round(((rit.duration ?? 0) - winst) / 60);
}
async function plan(van, naar, tijd, routed) {
  const p = new URLSearchParams({
    fromPlace: `${van.lat},${van.lon}`, toPlace: `${naar.lat},${naar.lon}`,
    time: tijd.toISOString(), arriveBy: "false", numItineraries: "3",
    preTransitModes: "WALK", maxPreTransitTime: "1200",
    postTransitModes: "WALK", maxPostTransitTime: "1200",
    maxDirectTime: "2700", useRoutedTransfers: String(routed), pedestrianSpeed: String(SPEED),
  });
  const lijst = (await get(`${MOTIS}/api/v6/plan?${p}`)).itineraries ?? [];
  if (!lijst.length) return null;
  // Eén maat voor beide kanten: wie is er als eerste, met dezelfde vraag.
  // (Niet hoe de agenda kiest — die kiest de laatste vertrektijd die het
  // haalt — maar wel wat je eerlijk naast elkaar kunt leggen.)
  return [...lijst].sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime))[0];
}
const klok = (iso) => new Date(iso).toLocaleTimeString("nl-NL",
  { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

const punten = new Map();
for (const adres of new Set(RITTEN.flat())) punten.set(adres, await geocode(adres));

let routedBeter = 0, officieelBeter = 0, gelijk = 0, mislukt = 0;
let winstRouted = 0, winstOfficieel = 0;
const opvallend = [];

for (const [vanT, naarT] of RITTEN) {
  for (const uur of UREN) {
    const tijd = new Date(); tijd.setDate(tijd.getDate() + 1); tijd.setHours(uur, 0, 0, 0);
    try {
      const [a, b] = await Promise.all([
        plan(punten.get(vanT), punten.get(naarT), tijd, true),
        plan(punten.get(vanT), punten.get(naarT), tijd, false),
      ]);
      if (!a || !b) { mislukt += 1; continue; }
      // Zelfde vraag, dus vergelijken op aankomst: eerder thuis is beter.
      const aA = Date.parse(a.endTime), aB = Date.parse(b.endTime);
      const verschil = Math.round((aA - aB) / 60000);
      const naam = `${vanT.split(",").at(-1).trim()} → ${naarT.split(",").at(-1).trim()} ${String(uur).padStart(2, "0")}u`;
      if (verschil === 0) gelijk += 1;
      else if (verschil > 0) { officieelBeter += 1; winstOfficieel += verschil; }
      else { routedBeter += 1; winstRouted += -verschil; }
      if (Math.abs(verschil) >= 5)
        opvallend.push(`  ${verschil > 0 ? "officieel" : "routed   "} ${String(Math.abs(verschil)).padStart(3)} min sneller  ${naam.padEnd(34)} ${klok(a.startTime)}→${klok(a.endTime)} vs ${klok(b.startTime)}→${klok(b.endTime)}`);
    } catch (e) { mislukt += 1; console.log(`  (${vanT} ${uur}u: ${e.message})`); }
  }
}

console.log(`\nVan ${routedBeter + officieelBeter + gelijk} vergelijkingen (${mislukt} mislukt):`);
console.log(`  gelijk                       : ${gelijk}`);
console.log(`  officiele overstaptijd sneller: ${officieelBeter}  (samen ${winstOfficieel} min)`);
console.log(`  routed transfers sneller      : ${routedBeter}  (samen ${winstRouted} min)`);
if (opvallend.length) {
  console.log("\nVerschillen van 5 minuten of meer:");
  for (const r of opvallend) console.log(r);
}
