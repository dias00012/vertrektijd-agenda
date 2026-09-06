import type { BikeEnds, GeoLocation } from "./types";

/**
 * De vraag die we aan de OV-planner (MOTIS/transitous) stellen.
 *
 * Deze parameters bepalen het antwoord meer dan welke code dan ook: een
 * verkeerde stand geeft geen foutmelding maar een geloofwaardige, te lange
 * reis. Daarom staan ze hier apart en onder test, met de standaardwaarden van
 * de planner erbij gedocumenteerd (uit de officiele OpenAPI-beschrijving van
 * MOTIS v2, `@motis-project/motis-client`).
 *
 * Bewust zonder `server-only`: het bouwt alleen een querystring op.
 */

/** Zo lang mag het fietsdeel naar of vanaf een halte duren. */
const MAX_BIKE_SECONDS = 30 * 60;
/**
 * Zo lang mag je naar de eerste halte lopen. De planner houdt het uit zichzelf
 * op een kwartier (`maxPreTransitTime` staat standaard op 900), en dat is net
 * te kort: wie twintig minuten naar het station loopt kreeg daardoor geen
 * wandelroute maar een omweg met een extra bus.
 */
const MAX_WALK_SECONDS = 20 * 60;
/**
 * Rijdt er niets, dan mag een directe loop- of fietsroute zo lang duren.
 * De planner staat zelf op een half uur (`maxDirectTime` = 1800).
 */
const MAX_DIRECT_SECONDS = 45 * 60;

export type TransitShape =
  /** Eén beste rit, voor de vertrektijd in de agenda. */
  | "best"
  /** Een vertrekbord met meerdere opties, voor de reisplanner. */
  | "timetable";

export interface TransitQuery {
  from: GeoLocation;
  to: GeoLocation;
  shape: TransitShape;
  /** ISO-tijd. Genegeerd zodra `cursor` is gezet. */
  time?: string;
  /** true = "uiterlijk aankomen om", false = "vertrekken vanaf". */
  arriveBy?: boolean;
  /** Aan welke kant van deze rit een fiets staat. */
  bike?: BikeEnds;
  /** Gewenst aantal opties; alleen zinvol bij `shape: "timetable"`. */
  options?: number;
  /** Cursor uit een eerder antwoord, om eerder/later te bladeren. */
  cursor?: string;
}

/** `lat,lon` zoals MOTIS een coordinaat verwacht. */
export function place(point: Pick<GeoLocation, "lat" | "lon">): string {
  return `${point.lat},${point.lon}`;
}

/**
 * Hoe je bij de halte komt en er weer vandaan. Lopen kan altijd; wie een fiets
 * heeft krijgt die er als mogelijkheid bij. Bewust naast elkaar en niet in
 * plaats van: met alleen fietsen viel de halte om de hoek af en kwam je op een
 * verder station uit, terwijl fietsen op een langere aanrijroute al snel
 * twintig minuten scheelt met precies dezelfde trein. De planner mag zelf per
 * rit kiezen wat sneller is.
 */
function applyStreetOptions(params: URLSearchParams, bike: BikeEnds | undefined): void {
  const bikeAtStart = bike === "origin" || bike === "both";
  params.set("preTransitModes", bikeAtStart ? "WALK,BIKE" : "WALK");
  params.set("maxPreTransitTime", String(bikeAtStart ? MAX_BIKE_SECONDS : MAX_WALK_SECONDS));

  const bikeAtEnd = bike === "destination" || bike === "both";
  params.set("postTransitModes", bikeAtEnd ? "WALK,BIKE" : "WALK");
  params.set("maxPostTransitTime", String(bikeAtEnd ? MAX_BIKE_SECONDS : MAX_WALK_SECONDS));
}

export function transitParams(query: TransitQuery): URLSearchParams {
  const params = new URLSearchParams({
    fromPlace: place(query.from),
    toPlace: place(query.to),
    maxDirectTime: String(MAX_DIRECT_SECONDS),
  });
  applyStreetOptions(params, query.bike);

  if (query.shape === "best") {
    /**
     * De agenda wil één antwoord: hoe laat moet ik weg. Precies waar
     * `timetableView=false` voor is — de planner rekent wachten dan mee als
     * reistijd en levert bij "uiterlijk aankomen om" de laatste vertrektijd
     * die het haalt. In vertrekbord-stand (de standaard) krijg je in plaats
     * daarvan een waaier opties waar je zelf uit moet kiezen, en dat ging
     * eerder mis: de app pakte blind de eerste.
     */
    params.set("timetableView", "false");
  } else {
    // Het vertrekbord: een venster met opties. `numItineraries` is een
    // ondergrens, geen bovengrens — de planner rekt het venster op tot hij er
    // zoveel heeft.
    params.set("numItineraries", String(query.options ?? 5));
  }

  // Bij bladeren bepaalt de cursor het tijdvenster; anders het gekozen tijdstip.
  if (query.cursor) {
    params.set("pageCursor", query.cursor);
  } else {
    if (query.time) params.set("time", query.time);
    params.set("arriveBy", String(query.arriveBy === true));
  }

  return params;
}
