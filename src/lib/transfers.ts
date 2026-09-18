import type { TravelLeg } from "./types";

/**
 * Hoeveel speling heb je bij een overstap?
 *
 * Dit is wat je op een station niet meer kunt repareren. Een rit die de app
 * teruggaf zag er zo uit: aankomst Utrecht 13:05, drie minuten lopen, en om
 * 13:09 vertrekt de volgende trein. Eén minuut speling -- is de eerste trein
 * twee minuten te laat, dan sta je een half uur te wachten.
 *
 * Op het scherm stond daar niets over. Je zag "2 overstappen" en de tijden per
 * onderdeel; dat 13:09 min 13:05 krap is moest je zelf bedenken.
 */

/** Onder deze speling noemen we een overstap krap. */
export const TIGHT_TRANSFER_MINUTES = 5;

export interface Transfer {
  /** Waar je overstapt. */
  at: string;
  /** Tussen aankomst en het volgende vertrek. */
  minutes: number;
  /** Daarvan lopend; de rest is wachten. */
  walkMinutes: number;
  /** Wat er aan speling overblijft. */
  slackMinutes: number;
  /** Zo krap dat een kleine vertraging je de aansluiting kost. */
  tight: boolean;
}

/** Onderdelen met een lijn zijn ritten; de rest is lopen of fietsen. */
function isRide(leg: TravelLeg): boolean {
  return Boolean(leg.line);
}

function minutesBetween(from: string | undefined, to: string | undefined): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60_000);
}

/**
 * De overstappen in een reis, met hun speling.
 *
 * Een overstap loopt van de aankomst van de ene rit tot het vertrek van de
 * volgende. Wat daartussen zit is lopen plus wachten; alleen dat wachten is
 * echte speling, want lopen moet je toch.
 *
 * Wat hier bewust níét in zit: de tijd vóór je eerste rit. Te laat op je
 * eerste trein is iets wat jij doet, geen aansluiting die je mist.
 */
export function transfersOf(legs: readonly TravelLeg[]): Transfer[] {
  const uit: Transfer[] = [];

  for (let i = 0; i < legs.length; i += 1) {
    if (!isRide(legs[i])) continue;

    // De volgende rit zoeken; wat ertussen zit is lopen.
    let j = i + 1;
    let walkMinutes = 0;
    while (j < legs.length && !isRide(legs[j])) {
      walkMinutes += legs[j].durationMinutes;
      j += 1;
    }
    if (j >= legs.length) break;

    const minutes = minutesBetween(legs[i].arrival, legs[j].departure);
    if (minutes === null) continue;

    const slackMinutes = Math.max(0, minutes - walkMinutes);
    uit.push({
      at: legs[i].to,
      minutes,
      walkMinutes,
      slackMinutes,
      tight: slackMinutes < TIGHT_TRANSFER_MINUTES,
    });
    i = j - 1;
  }

  return uit;
}

/** De krapste overstap van de reis, of null als er niet overgestapt wordt. */
export function tightestTransfer(legs: readonly TravelLeg[]): Transfer | null {
  const alle = transfersOf(legs);
  if (alle.length === 0) return null;
  return alle.reduce((krapst, huidig) =>
    huidig.slackMinutes < krapst.slackMinutes ? huidig : krapst,
  );
}
