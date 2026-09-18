import { toDateKey } from "./time";
import type { Journey } from "./types";

/**
 * Wat er in de lijst van de reisplanner bij een rit hoort te staan.
 *
 * Bewust los van het scherm, want het zijn twee beslissingen die je wilt
 * kunnen nalezen en testen zonder een browser te starten.
 */

/**
 * De dag waarop deze rit vertrekt, of `null` wanneer dat vandaag is.
 *
 * De kaart toonde alleen een kloktijd. Zoek je 's avonds om kwart over elf een
 * rit terug, dan krijg je zes opties waarvan er vijf morgen zijn -- en dat zag
 * je nergens. "05:40" leest dan als een vroege trein in plaats van als een rit
 * over zes uur.
 */
export function departureDay(journey: Journey, now: Date): string | null {
  const vertrek = new Date(journey.departure);
  if (Number.isNaN(vertrek.getTime())) return null;
  const dag = toDateKey(vertrek);
  return dag === toDateKey(now) ? null : dag;
}

/**
 * Komt deze rit op een latere dag aan dan hij vertrekt?
 *
 * Een rit van 23:40 tot 00:29 staat er anders als "23:40 → 00:29", en dat
 * leest als een reis die achteruit in de tijd gaat.
 */
export function arrivesNextDay(journey: Journey): boolean {
  const vertrek = new Date(journey.departure);
  const aankomst = new Date(journey.arrival);
  if (Number.isNaN(vertrek.getTime()) || Number.isNaN(aankomst.getTime())) return false;
  return toDateKey(aankomst) !== toDateKey(vertrek);
}

/**
 * De laatste rit die nog op tijd aankomt; `null` als er geen enkele is.
 *
 * Bij "uiterlijk aankomen om" is dit het antwoord op de vraag die je stelde:
 * hoe laat kan ik nog weg. De lijst staat op vertrektijd, zoals een
 * vertrekbord, dus die rit staat onderaan -- bovenaan staat degene die je er
 * twee uur te vroeg afzet. Markeren in plaats van omdraaien: de volgorde van
 * een vertrekbord is vertrouwd, en "eerder" en "later" blijven kloppen.
 *
 * Een rit die precies op de gevraagde tijd aankomt telt mee: "uiterlijk om
 * 09:00" betekent dat 09:00 nog goed is.
 */
export function latestOnTime(journeys: readonly Journey[], arriveBy: Date): string | null {
  const grens = arriveBy.getTime();
  if (Number.isNaN(grens)) return null;

  let beste: Journey | null = null;
  let besteTijd = -Infinity;

  for (const journey of journeys) {
    // Een uitgevallen rit haalt het per definitie niet.
    if (journey.cancelled) continue;
    const aan = new Date(journey.arrival).getTime();
    if (Number.isNaN(aan) || aan > grens) continue;
    if (aan > besteTijd) {
      besteTijd = aan;
      beste = journey;
    }
  }

  return beste?.id ?? null;
}
