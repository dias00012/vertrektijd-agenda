/**
 * Hoe vaak zit er een overstap in die krapper is dan onze eigen loopsnelheid?
 *
 * Bij Lelystad Centrum staat er 196 meter tussen het perron en het busstation
 * en geeft de dienstregeling er twee minuten voor: 5,9 km/h, sneller dan de
 * 5,04 waarmee de app elk ander loopstuk narekent (`src/lib/walkTimes.ts`).
 * 9292 rekent er drie minuten voor en biedt die bus daarom niet aan.
 *
 * Dit script telt hoe vaak zo'n krappe overstap in de beste rit zit en wat het
 * kost om hem te mijden. De uitkomst onderbouwt `additionalTransferTime` in
 * `src/lib/transitQuery.ts`: over 48 ritten leunden er 19 op zo'n overstap.
 *
 * Draaien met netwerk:
 *
 *   node scripts/krappe-overstap.mjs
 */
const MOTIS = "https://api.transitous.org";
const AGENT = "VertrektijdAgenda/dev (krappe overstap)";
const SPEED = 1.4;
const PUNTEN = {
  thuis: [52.398672, 5.299516], school: [52.489092, 5.493951],
  stadhuis: [52.371707, 5.221610], utrecht: [52.089200, 5.110030],
  schiphol: [52.309000, 4.762000], zwolle: [52.515000, 6.094400],
  haarlem: [52.380840, 4.636830], amsterdam: [52.373170, 4.892180],
  rotterdam: [51.922500, 4.479170], denbosch: [51.689300, 5.303700],
  marken: [52.458000, 5.106000], zierikzee: [51.650000, 3.919000],
};
const RITTEN = [
  ["thuis → school", "thuis", "school"], ["school → thuis", "school", "thuis"],
  ["thuis → stadhuis", "thuis", "stadhuis"], ["thuis → Utrecht", "thuis", "utrecht"],
  ["thuis → Schiphol", "thuis", "schiphol"], ["school → Zwolle", "school", "zwolle"],
  ["Haarlem → Utrecht", "haarlem", "utrecht"], ["Amsterdam → Rotterdam", "amsterdam", "rotterdam"],
  ["Den Bosch → Utrecht", "denbosch", "utrecht"], ["Utrecht → thuis", "utrecht", "thuis"],
  ["thuis → Marken", "thuis", "marken"], ["Zierikzee → Rotterdam", "zierikzee", "rotterdam"],
];
// Echte klokuren in Amsterdam, ongeacht de tijdzone van deze machine.
const MOMENTEN = ["07:00", "10:00", "16:00", "20:00"].map((t) => new Date(`2026-09-14T${t}:00+02:00`));

const klok = (iso) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
const nodig = (meters) => Math.ceil(meters / SPEED / 60) * 60;

/** Een overstap te krap voor onze eigen loopsnelheid? */
function krappeOverstap(rit) {
  const legs = rit.legs ?? [];
  for (const [i, leg] of legs.entries()) {
    if (i === 0 || i === legs.length - 1) continue;           // uiteinden: daar wacht niets
    if ((leg.mode ?? "").toUpperCase() !== "WALK") continue;
    if (!(leg.distance > 0) || !(leg.duration > 0)) continue;
    if (leg.duration < nodig(leg.distance)) {
      return { meters: Math.round(leg.distance), kreeg: Math.round(leg.duration / 60), nodig: nodig(leg.distance) / 60 };
    }
  }
  return null;
}

async function plan(van, naar, tijd) {
  const p = new URLSearchParams({
    fromPlace: `${van[0]},${van[1]}`, toPlace: `${naar[0]},${naar[1]}`,
    time: tijd.toISOString(), arriveBy: "false", numItineraries: "5",
    preTransitModes: "WALK", maxPreTransitTime: "1200",
    postTransitModes: "WALK", maxPostTransitTime: "1200",
    maxDirectTime: "2700", useRoutedTransfers: "false", pedestrianSpeed: String(SPEED),
  });
  const r = await fetch(`${MOTIS}/api/v6/plan?${p}`, { headers: { "User-Agent": AGENT, Accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).itineraries ?? [];
}

let ritten = 0, metKrappe = 0, geenAlternatief = 0, kosten = 0, mislukt = 0;
const details = [];
for (const [naam, v, n] of RITTEN) {
  for (const moment of MOMENTEN) {
    try {
      const lijst = await plan(PUNTEN[v], PUNTEN[n], moment);
      if (!lijst.length) { mislukt += 1; continue; }
      ritten += 1;
      const opTijd = [...lijst].sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime));
      const beste = opTijd[0];
      const krap = krappeOverstap(beste);
      if (!krap) continue;
      metKrappe += 1;
      const ruim = opTijd.find((rit) => !krappeOverstap(rit));
      if (!ruim) { geenAlternatief += 1; details.push(`  ${naam} ${klok(moment.toISOString())}: krap (${krap.meters} m in ${krap.kreeg} min, nodig ${krap.nodig}) — geen ruimer alternatief in de lijst`); continue; }
      const later = Math.round((Date.parse(ruim.endTime) - Date.parse(beste.endTime)) / 60000);
      kosten += later;
      details.push(`  ${naam} ${klok(moment.toISOString())}: krap (${krap.meters} m in ${krap.kreeg} min, nodig ${krap.nodig}) — ruimer kost ${later} min (${klok(beste.endTime)} → ${klok(ruim.endTime)})`);
    } catch { mislukt += 1; }
  }
}
console.log(`\n${ritten} ritten bekeken (${mislukt} mislukt):`);
console.log(`  met een te krappe overstap : ${metKrappe}`);
console.log(`  daarvan zonder alternatief : ${geenAlternatief}`);
console.log(`  samen later bij mijden     : ${kosten} min`);
if (details.length) { console.log(""); for (const d of details) console.log(d); }
