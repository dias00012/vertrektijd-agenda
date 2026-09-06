import type { ActivityOccurrence, GeoLocation, TravelRole } from "./types";
import { timeToMinutes } from "./time";

/**
 * Verblijven: opeenvolgende activiteiten op dezelfde plek op één dag.
 *
 * Een schoolrooster zet elk lesuur als eigen activiteit neer. Rekende de app
 * per les een reis, dan stond er bij het uur van 12:40 "vertrekken om 12:22"
 * terwijl je dan al op school zit, kwam er voor elke les een reisblok in je
 * week te staan, en werden er tientallen routes opgehaald voor één ritje.
 *
 * In het echt reis je 's ochtends heen en na je laatste uur weer terug. Daarom
 * hoort de heenreis bij de eerste activiteit van een verblijf en de terugreis
 * bij de laatste; de uren ertussen zijn gewoon uren op school.
 */

/**
 * Zonder bekende reistijd houden we twee uur aan. Korter dan dat gaat vrijwel
 * geen student tussendoor naar huis, ook niet met een tussenuur.
 */
const DEFAULT_GAP_MINUTES = 120;

/**
 * Wat je thuis minstens wilt overhouden voordat heen en weer reizen de moeite
 * waard is. Onder die grens blijf je waar je bent.
 */
const WORTH_GOING_HOME_MINUTES = 30;

/** Dezelfde plek? Coordinaten vergelijken; het label kan per les verschillen. */
function samePlace(a: GeoLocation, b: GeoLocation): boolean {
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;
}

/**
 * Hoe lang een gat mag zijn voordat je tussendoor naar huis gaat.
 *
 * Weten we hoe ver het is, dan rekenen we het uit: pas als je thuis langer
 * bent dan de reis heen en terug duurt, is teruggaan zinnig. Voor iemand die
 * tien minuten van school woont is een tussenuur genoeg om naar huis te gaan,
 * voor iemand met een uur reizen niet.
 */
function gapAllowance(first: ActivityOccurrence): number {
  const minutes = first.travel?.durationMinutes;
  if (!minutes || minutes <= 0) return DEFAULT_GAP_MINUTES;
  return 2 * minutes + WORTH_GOING_HOME_MINUTES;
}

const NO_TRAVEL: TravelRole = {
  outbound: false,
  inbound: false,
  onward: null,
  arrivesFrom: null,
};

/** Eén verblijf op één plek: de activiteiten daar, op volgorde. */
interface Stay {
  items: ActivityOccurrence[];
}

/**
 * Ga je tussen deze twee verblijven naar huis?
 *
 * Alleen als het past: heen en terug plus een halfuur om er iets aan te hebben.
 * Eindigt school om 17:00 en begint de sportschool om 18:30, dan haal je thuis
 * niet eens de deur; dan rijd je er rechtstreeks heen.
 *
 * Weten we de reistijden nog niet, dan houden we het bij thuis. Dat is wat de
 * app altijd deed en het is de aanname die niemand verrast.
 */
function goesHomeBetween(previous: Stay, next: Stay): boolean {
  const last = previous.items[previous.items.length - 1];
  const first = next.items[0];

  const back = last.returnTravel?.durationMinutes;
  const out = first.travel?.durationMinutes;
  if (back === undefined || out === undefined) return true;

  const gap = timeToMinutes(first.startTime) - timeToMinutes(last.endTime);
  return gap >= back + out + WORTH_GOING_HOME_MINUTES;
}

/**
 * Geeft elke activiteit van de dag zijn plek in het verblijf waar hij bij
 * hoort. Verwacht de activiteiten op starttijd gesorteerd.
 *
 * Activiteiten zonder locatie doen niet mee: daar valt niets te reizen, en ze
 * zeggen ook niets over waar je bent. Iets zonder plek tussen twee lessen door
 * betekent niet dat je naar huis ging.
 */
export function assignTravelRoles(items: ActivityOccurrence[]): ActivityOccurrence[] {
  const stays: Stay[] = [];

  let group: ActivityOccurrence[] = [];
  /** Laatste eindtijd binnen de groep; overlappende uren tellen ook mee. */
  let groupEnd = 0;

  function flush() {
    if (group.length > 0) stays.push({ items: group });
    group = [];
    groupEnd = 0;
  }

  for (const item of items) {
    if (!item.location) continue;

    const previous = group[group.length - 1];
    const fits =
      previous &&
      previous.location &&
      samePlace(previous.location, item.location) &&
      timeToMinutes(item.startTime) - groupEnd <= gapAllowance(group[0]);

    if (!fits) flush();

    group.push(item);
    groupEnd = Math.max(groupEnd, timeToMinutes(item.endTime));
  }
  flush();

  const roles = new Map<string, TravelRole>();
  for (const [index, stay] of stays.entries()) {
    const first = stay.items[0];
    const last = stay.items[stay.items.length - 1];

    const next = stays[index + 1];
    const direct = next && !goesHomeBetween(stay, next);

    stay.items.forEach((item, position) => {
      roles.set(item.occurrenceId, {
        // Heen en terug blijven aan de eerste en de laatste hangen, ook bij een
        // rechtstreekse overstap: die reistijden bepalen juist of thuiskomen
        // past. Alleen het tónen ervan verschuift, via `onward` en `arrivesFrom`.
        outbound: position === 0,
        inbound: position === stay.items.length - 1,
        onward: item === last && direct ? next.items[0].location : null,
        arrivesFrom:
          item === first && index > 0 && !goesHomeBetween(stays[index - 1], stay)
            ? (stays[index - 1].items[stays[index - 1].items.length - 1].location ?? null)
            : null,
      });
    });
  }

  return items.map((item) => ({
    ...item,
    travelRole: roles.get(item.occurrenceId) ?? NO_TRAVEL,
  }));
}
