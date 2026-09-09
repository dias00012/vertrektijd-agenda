import "server-only";
import { ProviderError } from "./config";
import { lastPlanVersion, motisPlan, toTravelLeg, type MotisItinerary } from "./motis";
import { tidyItineraries } from "../itineraries";
import { transitParams, walkSpeedMs } from "../transitQuery";
import { trimFinalWalk } from "../finalWalk";
import type { BikeEnds, GeoLocation, Journey, WalkSpeed } from "../types";

/**
 * De reisplanner: meerdere reismogelijkheden naast elkaar, met live
 * vertragingen en bladeren naar eerdere of latere ritten.
 *
 * Bewust niet gecachet: hier draait alles om actuele tijden.
 */

export interface JourneySearch {
  /** ISO-tijd waarop de reis begint of eindigt; standaard nu. */
  time?: string;
  /** true = "uiterlijk aankomen om", false = "vertrekken vanaf". */
  arriveBy?: boolean;
  /** Cursor uit een eerder antwoord, om eerder/later te bladeren. */
  cursor?: string;
  /** Aantal gewenste reisopties. */
  count?: number;
  /** Aan welke kant van de rit een fiets staat. */
  bike?: BikeEnds;
  /** Hoe snel je loopt; bepaalt elk loopstuk van de rit. */
  walk?: WalkSpeed;
}

export interface JourneyResult {
  journeys: Journey[];
  /** Cursors voor "eerdere ritten" en "latere ritten". */
  previousCursor?: string;
  nextCursor?: string;
  /**
   * Wat de planner precies deed. Niet voor het dagelijks gebruik, wel om een
   * rit die niet klopt te kunnen herleiden zonder in de code te duiken: welke
   * versie van de planner antwoordde, hoeveel opties er binnenkwamen, en
   * hoeveel er na het opschonen overbleven.
   */
  meta: {
    planVersion: string | null;
    routedTransfers: boolean;
    /** Aantal opties dat de planner teruggaf. */
    received: number;
    /** Aantal dat je uiteindelijk ziet. */
    shown: number;
    /** true wanneer er geen OV was en dit een directe loop-/fietsroute is. */
    directOnly: boolean;
  };
}

const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;

export async function planJourneys(
  from: GeoLocation,
  to: GeoLocation,
  search: JourneySearch = {},
): Promise<JourneyResult> {
  const count = Math.min(Math.max(search.count ?? DEFAULT_COUNT, 1), MAX_COUNT);

  const params = transitParams({
    from,
    to,
    shape: "timetable",
    options: count,
    time: search.time ?? new Date().toISOString(),
    arriveBy: search.arriveBy,
    bike: search.bike,
    walk: search.walk,
    cursor: search.cursor,
  });

  const data = await motisPlan(params);
  // Rijdt er niets, dan is er soms nog wel een directe loop- of fietsroute.
  // Die tonen is beter dan zeggen dat er geen verbinding is.
  const found = data.itineraries?.length ? data.itineraries : (data.direct ?? []);
  // Het laatste loopstuk narekenen voordat er iets wordt weggestreept: welke
  // optie een andere overbodig maakt hangt van de aankomsttijd af, en die
  // klopt pas na deze correctie. Zo staat er in de reisplanner ook hetzelfde
  // als in de agenda.
  const walked = found.map((itinerary) => trimFinalWalk(itinerary, walkSpeedMs(search.walk)));
  // Opties die op geen enkel punt winnen eruit, en op vertrektijd sorteren:
  // de volgorde waarin de planner ze teruggeeft ligt namelijk niet vast.
  const itineraries = tidyItineraries(walked);

  if (itineraries.length === 0) {
    // Bij bladeren is een lege pagina geen fout maar het einde van de
    // dienstregeling. Een fout zou de client de hele lijst en beide cursors
    // laten weggooien, en dan sta je na drie keer "later" met een leeg scherm
    // dat je niet eens terug kunt bladeren.
    if (search.cursor) {
      return {
        journeys: [],
        previousCursor: data.previousPageCursor,
        nextCursor: data.nextPageCursor,
        meta: {
          planVersion: lastPlanVersion(),
          routedTransfers: params.get("useRoutedTransfers") === "true",
          received: 0,
          shown: 0,
          directOnly: false,
        },
      };
    }
    throw new ProviderError("api.noConnection", 422);
  }

  const fromLabel = from.label || "vertrekpunt";
  const toLabel = to.label || "bestemming";

  const journeys = dedupe(
    itineraries
      .map((itinerary) => toJourney(itinerary, fromLabel, toLabel))
      .filter((journey): journey is Journey => journey !== null),
  );

  return {
    journeys,
    previousCursor: data.previousPageCursor,
    nextCursor: data.nextPageCursor,
    meta: {
      planVersion: lastPlanVersion(),
      routedTransfers: params.get("useRoutedTransfers") === "true",
      received: found.length,
      shown: journeys.length,
      directOnly: !data.itineraries?.length,
    },
  };
}

/**
 * Twee keer dezelfde rit in de lijst is verwarrend: je gaat verschillen zoeken
 * die er niet zijn. Gebeurt zodra de planner dezelfde trein teruggeeft met een
 * net ander looppad ernaartoe.
 */
function dedupe(journeys: Journey[]): Journey[] {
  const seen = new Set<string>();
  return journeys.filter((journey) => {
    if (seen.has(journey.id)) return false;
    seen.add(journey.id);
    return true;
  });
}

function toJourney(
  itinerary: MotisItinerary,
  fromLabel: string,
  toLabel: string,
): Journey | null {
  if (!itinerary.startTime || !itinerary.endTime || !itinerary.duration) return null;

  const legs = (itinerary.legs ?? [])
    .map((leg) => toTravelLeg(leg, fromLabel, toLabel))
    .filter((leg) => leg.durationMinutes > 0 || leg.line);

  // De reis is zo vertraagd als het meest vertraagde onderdeel.
  const delayMinutes = legs.reduce(
    (worst, leg) => Math.max(worst, leg.delayMinutes ?? 0),
    0,
  );

  return {
    // De lijn per onderdeel hoort erbij: twee ritten van 8:22 tot 8:54 met
    // evenveel onderdelen zijn niet dezelfde rit als de bus verschilt.
    id: `${itinerary.startTime}-${itinerary.endTime}-${legs
      .map((leg) => leg.line ?? leg.mode)
      .join(">")}`,
    departure: itinerary.startTime,
    arrival: itinerary.endTime,
    durationMinutes: Math.round(itinerary.duration / 60),
    transfers: itinerary.transfers ?? 0,
    legs,
    delayMinutes,
    realTime: legs.some((leg) => leg.realTime),
    cancelled: legs.some((leg) => leg.cancelled),
  };
}
