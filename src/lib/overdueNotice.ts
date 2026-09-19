"use client";

/**
 * De melding "je hebt iets over tijd", en of je hem hebt weggeklikt.
 *
 * Bewust apart van de agenda-instellingen, net als `changeLog`: dit is een
 * mededeling, geen instelling. Hij hoort niet mee te synchroniseren naar je
 * andere apparaten -- daar heb je hem misschien al gezien.
 *
 * Wegklikken onthoudt *welke* dingen je hebt weggeklikt, niet dát je hebt
 * weggeklikt. Dat scheelt precies het geval waar het om gaat: klik je hem weg
 * en gaat er morgen iets nieuws over tijd, dan hoor je dat gewoon weer. Was het
 * een enkele "niet meer tonen", dan zweeg de app daarna over alles.
 */

const KEY = "agenda.overtijdGezien.v1";

/**
 * Welke van deze dingen je nog niet hebt weggeklikt.
 *
 * @param overtijd Ids van alles wat nu over tijd is.
 * @param gezien Ids die je eerder hebt weggeklikt.
 */
export function unseenOverdue(overtijd: string[], gezien: string[]): string[] {
  const weg = new Set(gezien);
  return overtijd.filter((id) => !weg.has(id));
}

/**
 * Wat er na deze ronde bewaard moet blijven.
 *
 * Alleen ids die nu nog over tijd zijn: maak je iets af, dan verdwijnt het uit
 * de lijst, en gaat het later opnieuw over tijd dan is dat nieuw nieuws. Zonder
 * dit groeit de lijst een heel schooljaar door met ids die niet meer bestaan.
 */
export function pruneSeen(gezien: string[], overtijd: string[]): string[] {
  const nu = new Set(overtijd);
  return gezien.filter((id) => nu.has(id));
}

export function loadSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // Onleesbaar of privémodus: dan toon je de melding gewoon. Een melding te
    // veel is beter dan een deadline die je mist.
    return [];
  }
}

export function saveSeen(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Dan blijft het weggeklikt zolang dit scherm openstaat.
  }
}
