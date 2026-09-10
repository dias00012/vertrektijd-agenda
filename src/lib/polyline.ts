/**
 * Encoded polylines uitpakken en opmeten.
 *
 * De reisplanner geeft bij een loopstuk netjes de afstand mee, maar bij een
 * trein- of busrit niet: daar zit de route alleen in de tekening (`legGeometry`,
 * een encoded polyline). Wie dan de afstanden van de losse stukken optelt,
 * telt precies de vervoermiddelen niet mee en houdt de loopstukken over — bij
 * een rit Almere-Lelystad kwam er zo 1,8 km uit voor een reis van 25.
 *
 * Bewust zonder `server-only`: het is pure rekenkunde zonder netwerk, zodat
 * het los te testen is.
 */

/** Een punt op de route: [breedtegraad, lengtegraad]. */
export type Point = [number, number];

/**
 * Pakt het formaat uit dat Google bedacht en dat MOTIS gebruikt: verschillen
 * ten opzichte van het vorige punt, als getallen in tekens verpakt.
 *
 * `precision` zegt hoeveel decimalen erin zitten. Google zelf gebruikt er 5,
 * MOTIS levert 6 of 7; dat scheelt een factor tien of honderd, dus de waarde
 * uit het antwoord meegeven is geen detail.
 */
export function decodePolyline(points: string, precision = 5): Point[] {
  const factor = 10 ** precision;
  const result: Point[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < points.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let value = 0;
      let byte: number;
      do {
        byte = points.charCodeAt(index) - 63;
        // Een onverwacht teken (of het einde van de tekst) betekent dat de
        // rest niet te vertrouwen is; teruggeven wat we hebben is beter dan
        // een oneindige lus of een punt in de oceaan.
        if (Number.isNaN(byte) || byte < 0) return result;
        index += 1;
        value |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      // Het laagste bit zegt of het getal negatief was.
      const delta = value & 1 ? ~(value >> 1) : value >> 1;
      if (axis === 0) lat += delta;
      else lon += delta;
    }
    result.push([lat / factor, lon / factor]);
  }

  return result;
}

const EARTH_RADIUS_METERS = 6_371_000;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Afstand over het aardoppervlak tussen twee punten, in meters. */
export function metersBetween(a: Point, b: Point): number {
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const half =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(half)));
}

/** De lengte van een route: alle stukjes tussen de punten bij elkaar. */
export function pathMeters(path: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += metersBetween(path[i - 1], path[i]);
  return total;
}
