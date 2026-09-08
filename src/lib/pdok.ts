import type { GeocodeResult } from "./types";

/**
 * Het Nederlandse adressenregister (BAG), via de Locatieserver van PDOK.
 *
 * Waarom naast OpenStreetMap: voor Nederlandse huisadressen is de BAG de bron
 * waar elk adres in dit land in staat, met de exacte coordinaten van het pand.
 * OpenStreetMap kent lang niet elk huisnummer, en geeft dan een punt terug dat
 * honderden meters verderop kan liggen — met een looproute die daar netjes bij
 * past. Je ziet geen foutmelding, alleen een reistijd die niet klopt.
 *
 * Hier staat alleen het uitlezen van het antwoord; het ophalen zelf gebeurt in
 * `server/geocoding.ts`. Zo is deze vertaalslag los te testen.
 */

/** Eén resultaat zoals de Locatieserver het teruggeeft. */
export interface PdokDoc {
  type?: string;
  weergavenaam?: string;
  straatnaam?: string;
  /** Huisnummer inclusief letter en toevoeging, bv. "184" of "12-A". */
  huis_nlt?: string;
  postcode?: string;
  woonplaatsnaam?: string;
  gemeentenaam?: string;
  provincienaam?: string;
  /** "POINT(5.47139 52.51683)" — eerst lengte-, dan breedtegraad. */
  centroide_ll?: string;
}

export interface PdokResponse {
  response?: { docs?: PdokDoc[] };
}

/** "POINT(5.47139 52.51683)" → { lat, lon }; null als het niet leesbaar is. */
export function parsePoint(raw: string | undefined): { lat: number; lon: number } | null {
  if (!raw) return null;
  const match = /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i.exec(raw.trim());
  if (!match) return null;

  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Grof binnen Nederland; buiten dat bereik is er iets omgedraaid of mis.
  if (lat < 50 || lat > 54 || lon < 3 || lon > 8) return null;
  return { lat, lon };
}

/** De eerste regel van een suggestie: straat met huisnummer, of een plaatsnaam. */
function nameOf(doc: PdokDoc, parts: string[]): string {
  if (doc.straatnaam && doc.huis_nlt) return `${doc.straatnaam} ${doc.huis_nlt}`;
  if (doc.type === "weg" && doc.straatnaam) return doc.straatnaam;
  if (doc.type === "woonplaats" && doc.woonplaatsnaam) return doc.woonplaatsnaam;
  return doc.straatnaam || parts[0] || doc.weergavenaam || "";
}

/** De tweede regel: postcode en plaats, zonder te herhalen wat er al staat. */
function contextOf(doc: PdokDoc, name: string): string {
  return [doc.postcode, doc.woonplaatsnaam, doc.gemeentenaam]
    .filter((value): value is string => Boolean(value) && value !== name)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 2)
    .join(" ");
}

/** Zet het antwoord van de Locatieserver om in onze eigen zoekresultaten. */
export function toGeocodeResults(data: PdokResponse, limit: number): GeocodeResult[] {
  const docs = data?.response?.docs;
  if (!Array.isArray(docs)) return [];

  const results: GeocodeResult[] = [];
  for (const doc of docs) {
    const point = parsePoint(doc?.centroide_ll);
    if (!point) continue;

    const parts = (doc.weergavenaam ?? "").split(",").map((part) => part.trim());
    const name = nameOf(doc, parts);
    if (!name) continue;

    const place = doc.woonplaatsnaam;
    results.push({
      // Wat je terugziet in je agenda: "Donaustraat 184, Lelystad".
      label: place && !name.includes(place) ? `${name}, ${place}` : name,
      name,
      context: contextOf(doc, name),
      lat: point.lat,
      lon: point.lon,
    });
    if (results.length >= limit) break;
  }
  return results;
}
