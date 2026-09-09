/**
 * Het laatste stukje lopen, van de halte naar de voordeur.
 *
 * De planner rekent dat stuk soms veel trager dan welke loopsnelheid ook. Bij
 * Lelystad Palazzo zet bus 207 je aan de overkant van de Larserdreef af; van
 * de 916 meter naar de Donaustraat gaan de eerste 211 meter door de
 * Torenvalktunnel, en die 211 meter rekent de planner op tien minuten — 1,2
 * km/h. En het schaalt niet mee met wat we meesturen: zonder loopsnelheid 20
 * minuten, op 5 km/h 18, op 7,2 km/h nog altijd 15. Er zit dus geen snelheid
 * in maar een vaste straftijd uit de kaartgegevens.
 *
 * Daarom rekent de app dit ene stuk zelf, uit de afstand en de vaste
 * loopsnelheid. Bewust alleen het laatste stuk: dat kan je hooguit eerder
 * thuisbrengen. Het loopstuk naar de eerste halte en de overstap blijven staan
 * zoals de planner ze geeft — daar minuten afhalen betekent later de deur uit
 * en je trein missen, en dat is precies wat deze app niet mag doen.
 *
 * Bewust zonder `server-only`: pure rekenkunde, zodat het los te testen is.
 */

/**
 * Hoeveel trager dan je eigen tempo nog te verklaren is. Een oversteek, een
 * stoplicht en een trap maken een loopstuk echt wel langer dan afstand gedeeld
 * door snelheid; pas daarboven is het geen lopen meer maar een straftijd.
 */
const TOLERANCE = 1.4;

/** Wat we voor datzelfde oversteken en wachten teruggeven, in seconden. */
const CROSSING_ALLOWANCE_SECONDS = 60;

/** Het minimum dat we van een deelrit moeten weten om hem na te rekenen. */
export interface FinalWalkLeg {
  mode?: string;
  /** Reisduur in seconden. */
  duration?: number;
  /** Lengte van het loopstuk in meters. */
  distance?: number;
  startTime?: string;
  endTime?: string;
  scheduledEndTime?: string;
}

export interface FinalWalkItinerary {
  /** Reisduur in seconden. */
  duration?: number;
  startTime?: string;
  endTime?: string;
  legs?: FinalWalkLeg[];
}

function timeOf(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function shift(value: string | undefined, seconds: number): string | undefined {
  const ms = timeOf(value);
  return ms === null ? value : new Date(ms - seconds * 1000).toISOString();
}

/**
 * Rekent het laatste loopstuk na op de opgegeven loopsnelheid (in meters per
 * seconde) en geeft de rit terug met de tijden die daarbij horen.
 *
 * Verandert er niets, dan komt de rit ongewijzigd terug — dat is het normale
 * geval. De reis wordt hier nooit langer, alleen korter.
 */
export function trimFinalWalk<T extends FinalWalkItinerary>(itinerary: T, speed: number): T {
  const legs = itinerary.legs;
  const last = legs?.[legs.length - 1];
  if (!legs || !last || speed <= 0) return itinerary;
  if ((last.mode ?? "").toUpperCase() !== "WALK") return itinerary;

  const { distance, duration } = last;
  if (typeof distance !== "number" || !(distance > 0)) return itinerary;
  if (typeof duration !== "number" || !(duration > 0)) return itinerary;

  const expected = distance / speed;
  if (duration <= expected * TOLERANCE) return itinerary;

  // Op hele minuten naar boven: de app toont toch geen seconden, en zo blijft
  // "aankomst" hetzelfde als "vertrek plus de looptijd die eronder staat".
  const corrected = Math.ceil((expected + CROSSING_ALLOWANCE_SECONDS) / 60) * 60;
  const gained = duration - corrected;
  if (gained <= 0) return itinerary;

  const trimmed: FinalWalkLeg = {
    ...last,
    duration: corrected,
    endTime: shift(last.endTime, gained),
    scheduledEndTime: shift(last.scheduledEndTime, gained),
  };

  return {
    ...itinerary,
    duration: (itinerary.duration ?? 0) - gained,
    endTime: trimmed.endTime ?? itinerary.endTime,
    legs: [...legs.slice(0, -1), trimmed],
  };
}
