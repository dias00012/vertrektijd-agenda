import { dayRoleFor } from "./agenda";
import { daysBetween, todayKey } from "./time";
import { needsTravelRefresh, nextOccurrenceDate, travelPlanFor } from "./travel";
import type { Activity, GeoLocation, Settings } from "./types";

/**
 * Welke activiteiten krijgen nu een reistijd uitgerekend, en in welke volgorde?
 *
 * Dit stond los in `useAgenda`, waar het niet te testen was -- terwijl er een
 * echt incident achter zit. Een gekoppeld rooster staat er voor een heel
 * semester in, en zonder de grenzen hieronder werden dat 461 aanvragen ineens,
 * waarvan er 446 stukliepen op onze eigen verkeersdrempel. Resultaat: 446 lege
 * vertrektijden, precies bij de dagen waar je wél naar keek.
 *
 * Los en zonder klok van zichzelf, zodat elk van die grenzen na te rekenen is.
 */

/**
 * Zo ver vooruit rekent de app uit zichzelf reistijden uit.
 *
 * Verder heeft weinig zin: vervoerders publiceren hun dienstregeling niet
 * betrouwbaar over drie weken heen, en een gekoppeld rooster staat er voor een
 * heel semester in. Dat betekende bij het opstarten honderden aanvragen
 * tegelijk aan de gratis OV-dienst — waarvan het grootste deel stukliep op
 * onze eigen verkeersdrempel, met lege vertrektijden als resultaat. Kijk je
 * naar een dag die verder weg ligt, dan haalt `useOccurrenceTravel` die rit
 * alsnog op, en dan gaat het om één dag in plaats van om alles tegelijk.
 *
 * Een week dekt waar de app voor is: vandaag, morgen en het weekoverzicht.
 */
export const TRAVEL_HORIZON_DAYS = 7;

/** Na deze tijd mag een mislukte reisberekening het opnieuw proberen. */
export const FAILED_RETRY_MS = 15 * 60_000;

export interface TravelQueueItem {
  activity: Activity;
  /** Waar je hierna rechtstreeks heen gaat, of null. */
  onward: GeoLocation | null;
  /** De dag waarvoor gerekend wordt (jjjj-mm-dd). */
  dag: string;
}

export interface TravelQueue {
  /** Wat er doorgerekend moet worden, dichtstbijzijnde dag eerst. */
  items: TravelQueueItem[];
  /**
   * Sleutels waarvan de wachttijd om is.
   *
   * Die horen van de mislukt-lijst af. Teruggeven in plaats van hier
   * weghalen: een functie die stilletjes iets van buiten aanpast is precies
   * wat deze code onnavolgbaar maakte.
   */
  expired: string[];
}

export function travelQueue(
  activities: readonly Activity[],
  settings: Settings,
  now: Date,
  /** Sleutel -> moment waarop het misging. */
  failed: ReadonlyMap<string, number>,
): TravelQueue {
  const items: TravelQueueItem[] = [];
  const expired: string[] = [];
  if (!settings.home) return { items, expired };

  const today = todayKey(now);

  for (const activity of activities) {
    // De uren midden op een schooldag hebben geen eigen reis: je bent er al.
    // Zonder deze regel haalt een gekoppeld rooster tientallen routes op voor
    // hetzelfde ritje van huis naar school.
    const role = dayRoleFor(activity, activities as Activity[], now);
    if (!activity.location || (role && !role.outbound && !role.inbound)) continue;

    // Alleen wat binnenkort speelt. Kijk je wél naar een verdere dag, dan
    // haalt `useOccurrenceTravel` hem alsnog op.
    const dag = nextOccurrenceDate(activity, now);
    const dagen = daysBetween(today, dag);
    if (dagen < 0 || dagen > TRAVEL_HORIZON_DAYS) continue;

    const onward = role?.onward ?? null;
    if (!needsTravelRefresh(activity, settings, now, onward)) continue;

    const plan = travelPlanFor(activity, settings, now, onward);
    if (plan) {
      const mislukt = failed.get(plan.outboundKey);
      if (mislukt !== undefined) {
        if (now.getTime() - mislukt < FAILED_RETRY_MS) continue;
        expired.push(plan.outboundKey);
      }
    }
    items.push({ activity, onward, dag });
  }

  // Dichtstbijzijnde dag eerst. Loopt het toch tegen een grens aan, dan
  // sneuvelt de verste dag en niet die van morgenochtend.
  items.sort((a, b) => (a.dag < b.dag ? -1 : a.dag > b.dag ? 1 : 0));
  return { items, expired };
}
