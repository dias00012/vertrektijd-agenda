import { NextResponse } from "next/server";
import { say } from "@/lib/server/language";
import { route } from "@/lib/server/routing";
import { ProviderError } from "@/lib/server/config";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import type { BikeEnds, GeoLocation, TravelMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODES: TravelMode[] = ["car", "bike", "walk", "transit"];

interface TravelRequestBody {
  from?: Partial<GeoLocation>;
  to?: Partial<GeoLocation>;
  mode?: string;
  /** ISO-tijd: uiterlijk aankomen (heenreis met OV). */
  arriveBy?: string;
  /** ISO-tijd: op zijn vroegst vertrekken (terugreis met OV). */
  departAt?: string;
  /** "none" | "start" | "both": fiets naar (en vanaf) de halte. */
  bike?: string;
}

/** Accepteert alleen een geldige ISO-tijd; anders negeren we het veld. */
function isoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/** Alleen de drie bekende waarden; anders gewoon lopen. */
/** Alleen de vier bekende kanten; alles anders betekent gewoon lopen. */
function bikeOrNone(value: unknown): BikeEnds {
  return value === "origin" || value === "destination" || value === "both" ? value : "none";
}

function isValidPoint(point: Partial<GeoLocation> | undefined): point is GeoLocation {
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
 * POST /api/travel  { from, to, mode }
 *
 * HOME_LOCATION -> DESTINATION -> ROUTING API -> TRAVEL TIME
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "travel");
  if (limited) return limited;

  let body: TravelRequestBody;
  try {
    body = (await request.json()) as TravelRequestBody;
  } catch {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  if (!isValidPoint(body.from)) {
    return NextResponse.json({ error: say(request, "api.needHome") }, { status: 400 });
  }
  if (!isValidPoint(body.to)) {
    return NextResponse.json({ error: say(request, "api.unknownDestination") }, { status: 400 });
  }

  const mode = (body.mode ?? "car") as TravelMode;
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: say(request, "api.unknownMode") }, { status: 400 });
  }

  try {
    const result = await route(body.from, body.to, {
      mode,
      arriveBy: isoOrUndefined(body.arriveBy),
      departAt: isoOrUndefined(body.departAt),
      bike: bikeOrNone(body.bike),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: say(request, error.key) }, { status: error.status });
    }
    console.error("[api/travel]", error);
    return NextResponse.json({ error: say(request, "api.travelFailed") }, { status: 500 });
  }
}
