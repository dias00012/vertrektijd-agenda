import "server-only";
import type { BikeEnds, GeoLocation, TravelMode } from "@/lib/types";

/**
 * Wat er uit een verzoek mag komen.
 *
 * Deze controles stonden in twee routes los van elkaar, woord voor woord
 * hetzelfde. Twee kopieën van dezelfde regel is hoe ze uit elkaar gaan lopen:
 * scherp je er een aan, dan blijft de andere zoals hij was, en dan hangt het
 * van de route af wat er wordt geaccepteerd.
 */

/** De vervoermiddelen die de app kent. */
export const TRAVEL_MODES: TravelMode[] = ["car", "bike", "walk", "transit"];

/**
 * Is dit een punt waar je naartoe kunt reizen?
 *
 * Niet alleen "zijn het getallen", maar ook of ze binnen de aarde vallen. Een
 * lengtegraad van 500 is geen plek, en zonder deze grens gaat zo'n waarde
 * gewoon door naar de kaartdienst.
 */
export function isValidPoint(point: Partial<GeoLocation> | undefined): point is GeoLocation {
  return (
    !!point &&
    typeof point.lat === "number" &&
    typeof point.lon === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}

/**
 * Een tijd, of niets.
 *
 * Bewust niet "fout" bij onzin maar weglaten: een reisplanner zonder tijd
 * zoekt vanaf nu, en dat is bruikbaarder dan een foutmelding.
 */
export function isoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/** Een bekend vervoermiddel, of niets. */
export function travelModeOrUndefined(value: unknown): TravelMode | undefined {
  return TRAVEL_MODES.includes(value as TravelMode) ? (value as TravelMode) : undefined;
}

/** Alleen de vier bekende kanten; alles anders betekent gewoon lopen. */
export function bikeOrNone(value: unknown): BikeEnds {
  return value === "origin" || value === "destination" || value === "both" ? value : "none";
}
