import { metersBetween } from "./polyline";
import type { GeoLocation } from "./types";

/**
 * Is deze bestemming bewijsbaar te ver om te lopen of te fietsen?
 *
 * Stond in `server/routing.ts` en was daardoor niet na te rekenen, terwijl er
 * een gemelde fout achter zit: voor lopen stond de grens op vier uur, en
 * Almere Buiten naar Lelystad is 19,5 km -- vier uur en achttien minuten. Net
 * erboven, dus de app zei "geen looproute gevonden" terwijl die route gewoon
 * bestaat en je hem alleen niet wilt lopen.
 *
 * Bewust zonder `server-only`: het is rekenwerk met twee coordinaten.
 */

/**
 * Ruime bovengrens zodat ook lange fiets-/looproutes een antwoord geven.
 *
 * Voor lopen stond hier vier uur, en dat is korter dan het klinkt: Almere
 * Buiten naar Lelystad is 19,5 km, oftewel 4 uur en 18 minuten lopen. Net
 * erboven, dus de planner gaf niets terug en de app zei "geen looproute
 * gevonden" — terwijl die route gewoon bestaat en je hem alleen niet wilt
 * lopen. Op de fiets is vier uur nog altijd ruim honderd kilometer; die blijft
 * staan, ook omdat een lagere grens `beyondReach` scherper maakt.
 */
export const MAX_DIRECT_SECONDS: Record<"bike" | "walk", number> = {
  walk: 8 * 60 * 60,
  bike: 4 * 60 * 60,
};
/**
 * Royale bovengrenzen voor de snelheid van een wandelaar en een fietser, in
 * meters per seconde. Ze dienen maar één doel: uitrekenen of iets bewijsbaar
 * te ver is. Hemelsbreed is de ondergrens van elke echte route, dus haal je
 * die afstand op je hardst nog niet binnen de bovengrens, dan bestaat
 * er geen route die het wél haalt. Expres aan de hoge kant: we willen alleen
 * "te ver" zeggen als het zeker is.
 */
const FASTEST_WALK_MS = 1.6;
const FASTEST_BIKE_MS = 6;

/**
 * Staat vast dat hier geen route van te maken is binnen de bovengrens?
 *
 * Een route over straat is nooit korter dan de rechte lijn, dus als die lijn
 * al niet binnen de tijd te doen is, bestaat er geen route die het wel haalt.
 */
export function beyondReach(from: GeoLocation, to: GeoLocation, mode: "bike" | "walk"): boolean {
  const meters = metersBetween([from.lat, from.lon], [to.lat, to.lon]);
  const speed = mode === "bike" ? FASTEST_BIKE_MS : FASTEST_WALK_MS;
  return meters / speed > MAX_DIRECT_SECONDS[mode];
}
