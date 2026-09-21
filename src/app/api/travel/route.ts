import { NextResponse } from "next/server";
import { reportServerError } from "@/lib/server/report";
import { say } from "@/lib/server/language";
import { route } from "@/lib/server/routing";
import { ProviderError } from "@/lib/server/config";
import { enforceSharedRateLimit } from "@/lib/server/rateLimit";
import { bikeOrNone, isValidPoint, isoOrUndefined } from "@/lib/server/input";
import type { GeoLocation, TravelMode } from "@/lib/types";

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

/**
 * POST /api/travel  { from, to, mode }
 *
 * HOME_LOCATION -> DESTINATION -> ROUTING API -> TRAVEL TIME
 */
export async function POST(request: Request) {
  const limited = await enforceSharedRateLimit(request, "travel");
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
    reportServerError("api/travel", error);
    return NextResponse.json({ error: say(request, "api.travelFailed") }, { status: 500 });
  }
}
