import type { BikeEnds, GeoLocation, WalkSpeed } from "./types";

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

/**
 * Loopsnelheid in meters per seconde (`pedestrianSpeed`).
 *
 * De planner rekent zonder deze waarde met ongeveer 1,1 m/s (4 km/h) en dat
 * laten we ook zo bij "normaal": zonder waarde meesturen verandert er niets
 * aan wat je gewend bent. 9292 rekent met 5 km/h, dus wie zegt dat hij stevig
 * doorloopt krijgt dezelfde rekensom als daar — en bij drie loopstukken op één
 * reis scheelt dat al snel tien minuten.
 */
export const WALK_SPEEDS: Record<WalkSpeed, number | null> = {
  slow: 0.9,
  normal: null,
  fast: 1.4,
};

/**
 * Waar de planner zelf mee rekent, in meters per seconde. Bij "normaal" sturen
 * we bewust niets mee, maar om een loopstuk na te rekenen (`trimFinalWalk`) is
 * een getal nodig — en dan is dit het getal dat de planner zelf hanteert.
 */
export const PLANNER_WALK_MS = 1.1;

/** De loopsnelheid waar de app mee rekent, ook wanneer je niets koos. */
export function walkSpeedMs(walk: WalkSpeed | undefined): number {
  return (walk ? WALK_SPEEDS[walk] : null) ?? PLANNER_WALK_MS;
}

/**
 * Waar de app van uitgaat als je zelf niets kiest: stevig doorlopen, 5 km/h.
 *
 * Dezelfde aanname als 9292. De planner is uit zichzelf voorzichtiger (4 km/h)
 * en dat is geen fout, maar het maakt elke reis met drie loopstukken zo'n tien
 * minuten langer dan wat je gewend bent te zien — en dan lijkt de app trager
 * dan hij is. Wie rustiger loopt zet het in Instellingen terug.
 */
export const DEFAULT_WALK_SPEED: WalkSpeed = "fast";

/**
 * Hoeveel opties de agenda opvraagt om er zelf de beste uit te kiezen. Klein,
 * want het gaat om één antwoord; zie de uitleg bij `shape` in `transitParams`.
 */
const BEST_OPTIONS = 3;
/** Het vertrekbord van de reisplanner, als er niets gevraagd wordt. */
const TIMETABLE_OPTIONS = 5;

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
  /** Hoe snel je loopt; leeg = de snelheid van de planner zelf. */
  walk?: WalkSpeed;
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
    /**
     * Overstappen over de echte straat berekenen in plaats van uit de vaste
     * looppaden die bij de dienstregeling zitten (`useRoutedTransfers` staat
     * standaard uit).
     *
     * Die vaste looppaden zijn niet compleet. Ontbreekt er een tussen het
     * perron en het busstation ernaast, dan bestaat die overstap voor de
     * planner niet — ook al loop je het in drie minuten — en komt hij uit op
     * een latere bus vanaf een halte die wél in de lijst staat. Precies het
     * soort omweg dat er geloofwaardig uitziet en een kwartier kost.
     */
    useRoutedTransfers: "true",
  });
  applyStreetOptions(params, query.bike);

  const speed = query.walk ? WALK_SPEEDS[query.walk] : null;
  if (speed) params.set("pedestrianSpeed", String(speed));

  /**
   * Ook de agenda vraagt een klein venster op, geen enkele rit.
   *
   * Hier stond `timetableView=false`: dan rekent de planner wachten mee als
   * reistijd en geeft hij bij "uiterlijk aankomen om" precies één rit terug,
   * de laatste die het haalt. Dat leverde de goede vertrektijd op maar niet
   * de goede rit. Almere Buiten naar Lelystad, uiterlijk 08:30: je moet om
   * 07:12 weg, dat klopt — maar de rit die erbij kwam wachtte een half uur op
   * het busstation en zette je om 08:29 voor de deur, één minuut voor je
   * afspraak, terwijl je met dezelfde trein en een andere bus om 08:06 binnen
   * bent. De planner mag dat kiezen: van alles wat op tijd is, is het de
   * laatste vertrektijd.
   *
   * Met een venster kiest de app zelf, met `pickItinerary`: eerst zo laat
   * mogelijk de deur uit, en bij een gelijke vertrektijd de kortste rit. Dat
   * is precies waar die functie voor gemaakt is — hij kreeg alleen nooit iets
   * te kiezen. `numItineraries` is een ondergrens, geen bovengrens: de planner
   * rekt het venster op tot hij er zoveel heeft.
   */
  params.set(
    "numItineraries",
    String(query.shape === "best" ? BEST_OPTIONS : (query.options ?? TIMETABLE_OPTIONS)),
  );

  // Bij bladeren bepaalt de cursor het tijdvenster; anders het gekozen tijdstip.
  if (query.cursor) {
    params.set("pageCursor", query.cursor);
  } else {
    if (query.time) params.set("time", query.time);
    params.set("arriveBy", String(query.arriveBy === true));
  }

  return params;
}
