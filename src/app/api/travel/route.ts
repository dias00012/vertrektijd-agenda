import { NextResponse } from "next/server";
import { route } from "@/lib/server/routing";
import { ProviderError } from "@/lib/server/config";
import type { GeoLocation, TravelMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODES: TravelMode[] = ["car", "bike", "walk", "transit"];

interface TravelRequestBody {
  from?: Partial<GeoLocation>;
  to?: Partial<GeoLocation>;
  mode?: string;
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
  let body: TravelRequestBody;
  try {
    body = (await request.json()) as TravelRequestBody;
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (!isValidPoint(body.from)) {
    return NextResponse.json({ error: "Stel eerst je thuislocatie in." }, { status: 400 });
  }
  if (!isValidPoint(body.to)) {
    return NextResponse.json({ error: "De bestemming is onbekend." }, { status: 400 });
  }

  const mode = (body.mode ?? "car") as TravelMode;
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: "Onbekend vervoersmiddel." }, { status: 400 });
  }

  try {
    const result = await route(body.from, body.to, mode);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/travel]", error);
    return NextResponse.json({ error: "De reistijd kon niet worden berekend." }, { status: 500 });
  }
}
