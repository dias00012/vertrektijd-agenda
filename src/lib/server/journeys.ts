import "server-only";
import { ProviderError } from "./config";
import { motisPlan, toTravelLeg, type MotisItinerary } from "./motis";
import { place } from "./routing";
import type { GeoLocation, Journey } from "../types";

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
}

export interface JourneyResult {
  journeys: Journey[];
  /** Cursors voor "eerdere ritten" en "latere ritten". */
  previousCursor?: string;
  nextCursor?: string;
}

const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;

export async function planJourneys(
  from: GeoLocation,
  to: GeoLocation,
  search: JourneySearch = {},
): Promise<JourneyResult> {
  const count = Math.min(Math.max(search.count ?? DEFAULT_COUNT, 1), MAX_COUNT);

  const params = new URLSearchParams({
    fromPlace: place(from),
    toPlace: place(to),
    numItineraries: String(count),
  });

  // Bij bladeren bepaalt de cursor het tijdvenster; anders het gekozen tijdstip.
  if (search.cursor) {
    params.set("pageCursor", search.cursor);
  } else {
    params.set("time", search.time ?? new Date().toISOString());
    params.set("arriveBy", String(Boolean(search.arriveBy)));
  }

  const data = await motisPlan(params);
  const itineraries = data.itineraries ?? [];

  if (itineraries.length === 0) {
    throw new ProviderError(
      "Geen verbinding gevonden. Probeer een ander tijdstip of een andere halte.",
      422,
    );
  }

  const fromLabel = from.label || "vertrekpunt";
  const toLabel = to.label || "bestemming";

  return {
    journeys: itineraries
      .map((itinerary) => toJourney(itinerary, fromLabel, toLabel))
      .filter((journey): journey is Journey => journey !== null),
    previousCursor: data.previousPageCursor,
    nextCursor: data.nextPageCursor,
  };
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
    id: `${itinerary.startTime}-${itinerary.endTime}-${legs.length}`,
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
