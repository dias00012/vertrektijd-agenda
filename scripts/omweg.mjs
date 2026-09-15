/**
 * Welke loopstukken het eerst nagekeken moeten worden.
 *
 * Onze looproutes komen uit OpenStreetMap. Ontbreekt daar een oversteek of een
 * pad, dan lopen we om en staat er een paar minuten te veel in de app. Bij
 * Lelystad Palazzo is dat zo (zie KAARTFOUTEN.md), en dat is met de hand
 * gevonden. Dit script zoekt kandidaten: het legt elk loopstuk naast de rechte
 * lijn ertussen en zet de krommste bovenaan.
 *
 * **Een hoge verhouding is geen bewijs.** Nederland ligt vol water, spoor en
 * snelwegen, en daar loop je nu eenmaal omheen; 1,4× de rechte lijn is heel
 * normaal in een stad. Wat dit script oplevert is een volgorde om in te
 * kijken, niet een lijst fouten. Wie boven aan de lijst staat, verdient een
 * blik op de kaart — meer zegt het niet.
 *
 * Draaien met netwerk:
 *
 *   node scripts/omweg.mjs
 */
const MOTIS = "https://api.transitous.org";
const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const AGENT = "VertrektijdAgenda/dev (omweg)";
const SPEED = 1.4;
const VERDACHT = 1.5;

const RITTEN = [
  ["Gran Canariastraat 60, Almere", "Donaustraat 184, Lelystad"],
  ["Gran Canariastraat 60, Almere", "Hospitaaldreef 5, Almere"],
  ["Gran Canariastraat 60, Almere", "Stationsplein 49, Utrecht"],
  ["Donaustraat 184, Lelystad", "Grote Markt 1, Zwolle"],
  ["Stationsplein 1, Amersfoort", "Neude 11, Utrecht"],
  ["Donaustraat 184, Lelystad", "Gran Canariastraat 60, Almere"],
  ["Kalverstraat 1, Amsterdam", "Coolsingel 40, Rotterdam"],
  ["Grote Markt 1, Haarlem", "Vredenburg 40, Utrecht"],
  ["Markt 1, Den Bosch", "Grote Markt 1, Groningen"],
  ["Vrijthof 1, Maastricht", "Markt 1, Eindhoven"],
  ["Oude Markt 24, Enschede", "Stationsplein 1, Deventer"],
  ["Grote Markt 1, Breda", "Markt 1, Tilburg"],
  ["Havenplein 1, Zierikzee", "Markt 1, Goes"],
  ["Voorstraat 1, Dordrecht", "Coolsingel 40, Rotterdam"],
  ["Brink 1, Assen", "Grote Markt 1, Groningen"],
  ["Waagplein 1, Alkmaar", "Kalverstraat 1, Amsterdam"],
  ["Markt 1, Middelburg", "Grote Markt 1, Breda"],
  ["Stationsplein 1, Leiden", "Grote Markt 1, Den Haag"],
  ["Grote Markt 1, Nijmegen", "Velperplein 1, Arnhem"],
  ["Kerkstraat 1, Hoorn", "Waagplein 1, Alkmaar"],
];

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
function recht(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
async function plan(van, naar, tijd) {
  const p = new URLSearchParams({
    fromPlace: `${van.lat},${van.lon}`, toPlace: `${naar.lat},${naar.lon}`,
    time: tijd.toISOString(), arriveBy: "false", numItineraries: "1",
    preTransitModes: "WALK", maxPreTransitTime: "1200",
    postTransitModes: "WALK", maxPostTransitTime: "1200",
    maxDirectTime: "2700", useRoutedTransfers: "true", pedestrianSpeed: String(SPEED),
  });
  return (await get(`${MOTIS}/api/v6/plan?${p}`)).itineraries?.[0] ?? null;
}

const tijd = new Date(); tijd.setDate(tijd.getDate() + 1); tijd.setHours(8, 0, 0, 0);
const stukken = [];
for (const [vanT, naarT] of RITTEN) {
  try {
    const [van, naar] = await Promise.all([geocode(vanT), geocode(naarT)]);
    const rit = await plan(van, naar, tijd);
    if (!rit) continue;
    const legs = rit.legs ?? [];
    for (const [i, leg] of legs.entries()) {
      if ((leg.mode ?? "").toUpperCase() !== "WALK") continue;
      const m = leg.distance ?? 0;
      if (m < 300) continue; // korte stukjes hebben altijd een hoge verhouding
      const a = i === 0 ? van : leg.from?.lat != null ? { lat: leg.from.lat, lon: leg.from.lon } : null;
      const b = i === legs.length - 1 ? naar : leg.to?.lat != null ? { lat: leg.to.lat, lon: leg.to.lon } : null;
      if (!a || !b) continue;
      const lijn = recht(a, b);
      if (lijn < 100) continue;
      stukken.push({ rit: `${vanT.split(",")[1]?.trim()} → ${naarT.split(",")[1]?.trim()}`,
        m: Math.round(m), lijn: Math.round(lijn), verhouding: m / lijn,
        extra: (m - lijn * 1.3) / SPEED / 60 });
    }
  } catch (e) { console.log(`${vanT} → ${naarT}: ${e.message}`); }
}

stukken.sort((a, b) => b.verhouding - a.verhouding);
console.log("\nverhouding  meter  rechte lijn   rit");
for (const s of stukken)
  console.log(`  ${s.verhouding.toFixed(2)}${s.verhouding > VERDACHT ? " !" : "  "}  ${String(s.m).padStart(5)}  ${String(s.lijn).padStart(11)}   ${s.rit}`);

const verdacht = stukken.filter((s) => s.verhouding > VERDACHT);
const mediaan = stukken.length
  ? [...stukken].sort((a, b) => a.verhouding - b.verhouding)[Math.floor(stukken.length / 2)].verhouding
  : 0;
console.log(`\n${stukken.length} loopstukken van 300 m of langer.`);
console.log(`Mediaan omweg: ${mediaan.toFixed(2)}× de rechte lijn.`);
console.log(`Boven ${VERDACHT}×: ${verdacht.length} (${Math.round((verdacht.length / stukken.length) * 100)}%).`);
if (verdacht.length) {
  const min = verdacht.reduce((s, v) => s + Math.max(0, v.extra), 0) / verdacht.length;
  console.log(`Die kosten gemiddeld ${min.toFixed(1)} min extra t.o.v. een normale omweg van 1,3×.`);
}
