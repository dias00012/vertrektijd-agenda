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

const NO_TRAVEL: TravelRole = { outbound: false, inbound: false };

/**
 * Geeft elke activiteit van de dag zijn plek in het verblijf waar hij bij
 * hoort. Verwacht de activiteiten op starttijd gesorteerd.
 *
 * Activiteiten zonder locatie doen niet mee: daar valt niets te reizen, en ze
 * zeggen ook niets over waar je bent. Iets zonder plek tussen twee lessen door
 * betekent niet dat je naar huis ging.
 */
export function assignTravelRoles(items: ActivityOccurrence[]): ActivityOccurrence[] {
  const roles = new Map<string, TravelRole>();

  let group: ActivityOccurrence[] = [];
  /** Laatste eindtijd binnen de groep; overlappende uren tellen ook mee. */
  let groupEnd = 0;

  function flush() {
    group.forEach((item, index) => {
      roles.set(item.occurrenceId, {
        outbound: index === 0,
        inbound: index === group.length - 1,
      });
    });
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

  return items.map((item) => ({
    ...item,
    travelRole: roles.get(item.occurrenceId) ?? NO_TRAVEL,
  }));
}
