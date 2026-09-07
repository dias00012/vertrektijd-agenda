import "server-only";
import { fetchWithTimeout, getProviderConfig, ProviderError } from "./config";
import type { TravelLeg, TravelLegMode } from "../types";

/**
 * Gedeelde laag rond MOTIS/transitous: de bron voor OV-reizen, fietsroutes en
 * looproutes. Gratis en zonder sleutel, maar met een herkenbare User-Agent
 * (zie https://transitous.org/api/).
 *
 * Zowel de agenda (één reis per activiteit) als de reisplanner (meerdere
 * reisopties) gebruiken deze module, zodat ritten overal hetzelfde worden
 * uitgelezen.
 */

export interface MotisPlace {
  name?: string;
  track?: string;
  lat?: number;
  lon?: number;
}

export interface MotisLeg {
  mode?: string;
  duration?: number;
  distance?: number;
  startTime?: string;
  endTime?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  realTime?: boolean;
  cancelled?: boolean;
  from?: MotisPlace;
  to?: MotisPlace;
  routeShortName?: string;
  headsign?: string;
  agencyName?: string;
  tripShortName?: string;
}

export interface MotisItinerary {
  duration?: number;
  startTime?: string;
  endTime?: string;
  transfers?: number;
  legs?: MotisLeg[];
}

export interface MotisPlanResponse {
  itineraries?: MotisItinerary[];
  direct?: MotisItinerary[];
  previousPageCursor?: string;
  nextPageCursor?: string;
}

/** Roept de MOTIS-reisplanner aan en vertaalt fouten naar nette meldingen. */
export async function motisPlan(params: URLSearchParams): Promise<MotisPlanResponse> {
  const config = getProviderConfig();
  const url = `${config.motisBaseUrl}/api/v1/plan?${params.toString()}`;

  const response = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": config.userAgent, Accept: "application/json" } },
    12_000,
  );

  if (response.status === 429) {
    throw new ProviderError("api.tooManyJourneys", 429);
  }
  if (!response.ok) {
    throw new ProviderError("api.plannerDown");
  }
  return (await response.json()) as MotisPlanResponse;
}

/** Zoekt haltes en stations op naam. */
export async function motisGeocode(
  text: string,
): Promise<{ name: string; lat: number; lon: number; type: string }[]> {
  const config = getProviderConfig();
  const url = `${config.motisBaseUrl}/api/v1/geocode?text=${encodeURIComponent(text)}`;

  const response = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": config.userAgent, Accept: "application/json" } },
    8_000,
  );
  // Bewust een fout en geen lege lijst: "de dienst hapert" is iets anders dan
  // "niets gevonden", en de aanroeper bewaart die twee verschillend lang.
  if (!response.ok) throw new ProviderError("api.geocodeFailed");

  const data = (await response.json()) as {
    name?: string;
    lat?: number;
    lon?: number;
    type?: string;
  }[];
  if (!Array.isArray(data)) throw new ProviderError("api.geocodeFailed");

  return data
    .filter((item) => typeof item.lat === "number" && typeof item.lon === "number" && item.name)
    .map((item) => ({
      name: item.name as string,
      lat: item.lat as number,
      lon: item.lon as number,
      type: item.type ?? "",
    }));
}

/** Vertaalt een MOTIS-vervoerswijze naar onze eigen, compactere set. */
export function toLegMode(motisMode: string | undefined): TravelLegMode {
  switch ((motisMode ?? "").toUpperCase()) {
    case "WALK":
      return "walk";
    case "BIKE":
      return "bike";
    case "CAR":
      return "car";
    case "BUS":
    case "COACH":
      return "bus";
    case "TRAM":
      return "tram";
    case "SUBWAY":
    case "METRO":
      return "subway";
    case "FERRY":
      return "ferry";
    case "RAIL":
    case "REGIONAL_RAIL":
    case "REGIONAL_FAST_RAIL":
    case "LONG_DISTANCE":
    case "HIGHSPEED_RAIL":
    case "NIGHT_RAIL":
      return "rail";
    default:
      return "other";
  }
}

/**
 * MOTIS noemt begin- en eindpunt "START" en "END". We vervangen die door de
 * namen die de gebruiker kent ("thuis", "Windesheim Almere").
 */
function placeName(raw: string | undefined, fromLabel: string, toLabel: string): string {
  if (!raw) return "";
  if (raw === "START") return fromLabel;
  if (raw === "END") return toLabel;
  return raw;
}

/** Verschil in hele minuten tussen twee ISO-tijden. */
function minutesBetween(later: string | undefined, earlier: string | undefined): number {
  if (!later || !earlier) return 0;
  const diff = new Date(later).getTime() - new Date(earlier).getTime();
  return Number.isNaN(diff) ? 0 : Math.round(diff / 60_000);
}

export function toTravelLeg(leg: MotisLeg, fromLabel: string, toLabel: string): TravelLeg {
  const delay = minutesBetween(leg.startTime, leg.scheduledStartTime);
  return {
    mode: toLegMode(leg.mode),
    durationMinutes: Math.round((leg.duration ?? 0) / 60),
    from: placeName(leg.from?.name, fromLabel, toLabel),
    to: placeName(leg.to?.name, fromLabel, toLabel),
    departure: leg.startTime,
    arrival: leg.endTime,
    line: leg.routeShortName,
    headsign: leg.headsign,
    agency: leg.agencyName,
    trip: leg.tripShortName,
    track: leg.from?.track,
    scheduledDeparture: leg.scheduledStartTime,
    scheduledArrival: leg.scheduledEndTime,
    realTime: leg.realTime === true,
    // Alleen melden bij een echte afwijking; 0 is ruis in de weergave.
    delayMinutes: delay !== 0 ? delay : undefined,
    cancelled: leg.cancelled === true,
  };
}
