/**
 * Wat kost de overstapboete van vijf minuten in `pickItinerary`?
 *
 * De agenda kiest de laatste vertrektijd die je starttijd nog haalt, maar telt
 * elke overstap als vijf minuten later vertrekken (`TRANSFER_PENALTY_MINUTES`
 * in `src/lib/itineraries.ts`). Een overstap kost tijd op het perron en is het
 * eerste wat misgaat zodra er iets vertraagd is — maar hij mag je niet een
 * kwartier eerder uit bed jagen. Dit script legt dezelfde keuze naast zichzelf
 * zonder boete: hoe vaak scheelt het, en hoeveel.
 *
 * De uitkomst die de waarde in de code onderbouwt, over 48 vergelijkingen:
 *
 *     zelfde rit gekozen         43
 *     boete kost vertrektijd      5  (samen 9 minuten)
 *     boete levert vertrektijd op 0
 *
 * Het duurste geval: drie minuten eerder weg, met een overstap minder.
 *
 * Draaien met netwerk:
 *
 *   node scripts/overstapboete.mjs
 */
const MOTIS = "https://api.transitous.org";
const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const AGENT = "VertrektijdAgenda/dev (overstapboete)";
const SPEED = 1.4;
const RITTEN = [
  ["Stationsplein 1, Almere", "Stationsplein 1, Lelystad"],
  ["Stationsplein 1, Almere", "Stationsplein 49, Utrecht"],
  ["Stationsplein 1, Almere", "Evert van de Beekstraat 202, Schiphol"],
  ["Stationsplein 1, Lelystad", "Grote Markt 1, Zwolle"],
  ["Stationsplein 1, Almere", "Kerkstraat 1, Marken"],
  ["Kalverstraat 1, Amsterdam", "Coolsingel 40, Rotterdam"],
  ["Grote Markt 1, Haarlem", "Vredenburg 40, Utrecht"],
  ["Markt 1, Den Bosch", "Grote Markt 1, Groningen"],
  ["Vrijthof 1, Maastricht", "Markt 1, Eindhoven"],
  ["Stationsplein 1, Leiden", "Grote Markt 1, Den Haag"],
  ["Oude Markt 24, Enschede", "Stationsplein 1, Deventer"],
  ["Havenplein 1, Zierikzee", "Markt 1, Goes"],
];
const UREN = [9, 13, 17, 20];

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": AGENT, Accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function geocode(q) {
  const u = new URL(`${PDOK}/free`);
  u.searchParams.set("q", q); u.searchParams.set("rows", "1"); u.searchParams.set("fq", "type:adres");
  const h = (await get(u.toString()))?.response?.docs?.[0];
  const [lon, lat] = h.centroide_ll.replace(/POINT\(|\)/g, "").split(" ").map(Number);
  return { lat, lon };
}
/** Zelfde correctie als walkTimes.ts: het eerste loopstuk schuift de vertrektijd op. */
function gecorrigeerd(rit) {
  const legs = rit.legs ?? [];
  const eerste = legs[0];
  let start = Date.parse(rit.startTime);
  if (legs.length > 1 && (eerste?.mode ?? "").toUpperCase() === "WALK" && eerste.distance > 0) {
    const echt = Math.ceil(eerste.distance / SPEED / 60) * 60;
    const winst = Math.max(0, (eerste.duration ?? 0) - echt);
    start += winst * 1000;
  }
  return { start, eind: Date.parse(rit.endTime), overstappen: rit.transfers ?? 0 };
}
function kies(ritten, deadline, boeteMin) {
  const optijd = ritten.filter((r) => r.eind <= deadline);
  const lijst = optijd.length ? optijd : ritten;
  return lijst.reduce((best, r) => {
    const score = (x) => x.overstappen * boeteMin * 60000 - x.start;
    if (score(r) !== score(best)) return score(r) < score(best) ? r : best;
    return r.eind - r.start < best.eind - best.start ? r : best;
  });
}
const klok = (ms) => new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

const punten = new Map();
for (const adres of new Set(RITTEN.flat())) punten.set(adres, await geocode(adres));

let gelijk = 0, boeteKost = 0, boeteWint = 0, mislukt = 0, minutenKwijt = 0;
const details = [];
for (const [vanT, naarT] of RITTEN) {
  for (const uur of UREN) {
    const deadline = new Date(); deadline.setDate(deadline.getDate() + 1); deadline.setHours(uur, 0, 0, 0);
    const p = new URLSearchParams({
      fromPlace: `${punten.get(vanT).lat},${punten.get(vanT).lon}`,
      toPlace: `${punten.get(naarT).lat},${punten.get(naarT).lon}`,
      time: deadline.toISOString(), arriveBy: "true", numItineraries: "3",
      preTransitModes: "WALK", maxPreTransitTime: "1200",
      postTransitModes: "WALK", maxPostTransitTime: "1200",
      maxDirectTime: "2700", useRoutedTransfers: "false", pedestrianSpeed: String(SPEED),
    });
    try {
      const lijst = ((await get(`${MOTIS}/api/v6/plan?${p}`)).itineraries ?? []).map(gecorrigeerd);
      if (!lijst.length) { mislukt += 1; continue; }
      const metBoete = kies(lijst, deadline.getTime(), 5);
      const zonder = kies(lijst, deadline.getTime(), 0);
      const verschil = Math.round((zonder.start - metBoete.start) / 60000);
      const naam = `${vanT.split(",").at(-1).trim()} → ${naarT.split(",").at(-1).trim()} ${String(uur).padStart(2, "0")}u`;
      if (verschil === 0) gelijk += 1;
      else if (verschil > 0) {
        boeteKost += 1; minutenKwijt += verschil;
        details.push(`  ${String(verschil).padStart(3)} min eerder weg door de boete  ${naam.padEnd(32)} ${klok(metBoete.start)} (${metBoete.overstappen}x) vs ${klok(zonder.start)} (${zonder.overstappen}x)`);
      } else boeteWint += 1;
    } catch (e) { mislukt += 1; console.log(`  (${naarT} ${uur}u: ${e.message})`); }
  }
}
console.log(`\nVan ${gelijk + boeteKost + boeteWint} vergelijkingen (${mislukt} mislukt):`);
console.log(`  zelfde rit gekozen            : ${gelijk}`);
console.log(`  boete kost vertrektijd        : ${boeteKost}  (samen ${minutenKwijt} min eerder weg)`);
console.log(`  boete levert vertrektijd op   : ${boeteWint}`);
if (details.length) { console.log("\nWaar het verschil zat:"); for (const d of details) console.log(d); }
