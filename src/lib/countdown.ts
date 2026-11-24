import type { ActivityOccurrence, Settings } from "./types";
import { minutesUntilDeparture } from "./agenda";

/**
 * De aftelling naar je vertrektijd, en het cijfertje op het app-icoon.
 *
 * Allebei dezelfde vraag — hoeveel minuten heb ik nog — maar op twee plekken
 * met twee grenzen. Hier bij elkaar, los van het scherm, zodat de regels
 * getest kunnen worden en het vertrekscherm en het dashboard niet uit elkaar
 * gaan lopen.
 */

/** Verder dan een halve dag vooruit aftellen zegt niets; dan telt de datum. */
export const COUNTDOWN_HORIZON_MINUTES = 12 * 60;
/**
 * Tot zover telt het icoon mee. Een uur is precies de tijd waarin je er iets
 * mee kunt: je jas pakken, je fiets alvast klaarzetten.
 */
export const BADGE_HORIZON_MINUTES = 60;
/** Zo lang na je vertrektijd blijft "nu gaan" staan in plaats van "te laat". */
const GRACE_MINUTES = 5;

export type Countdown =
  /** Je hebt nog tijd; `minutes` is hoeveel. */
  | { state: "soon"; minutes: number }
  /** Het is zover. */
  | { state: "now" }
  /** De vertrektijd is voorbij. */
  | { state: "passed" };

/**
 * Wat er onder de vertrektijd hoort te staan. `null` = niets: er is geen
 * vertrektijd, of hij ligt zo ver weg dat een aftelling nergens op slaat.
 */
export function departureCountdown(
  minutes: number | null,
  horizonMinutes: number = COUNTDOWN_HORIZON_MINUTES,
): Countdown | null {
  if (minutes === null || minutes > horizonMinutes) return null;
  if (minutes > 0) return { state: "soon", minutes };
  if (minutes > -GRACE_MINUTES) return { state: "now" };
  return { state: "passed" };
}

/**
 * Het getal op het app-icoon: de minuten die je nog hebt.
 *
 * `null` betekent: weghalen. Dat is bewust ook zo zodra je vertrektijd ruim
 * voorbij is — een icoon dat "1" blijft roepen voor een bus die allang weg is
 * leert je het cijfer te negeren, en dan werkt het nooit meer.
 */
export function badgeValue(minutes: number | null): number | null {
  const countdown = departureCountdown(minutes, BADGE_HORIZON_MINUTES);
  if (!countdown) return null;
  if (countdown.state === "soon") return countdown.minutes;
  // "Nu gaan" kan geen 0 zijn: nul betekent bij de browser "haal het weg".
  if (countdown.state === "now") return 1;
  return null;
}

/** De minuten tot vertrek van de eerstvolgende activiteit, of null. */
export function minutesUntilNextDeparture(
  next: ActivityOccurrence | null,
  settings: Settings,
  now: Date,
): number | null {
  if (!next) return null;
  return minutesUntilDeparture(next, settings, now);
}
