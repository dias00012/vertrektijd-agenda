import { NextResponse } from "next/server";
import { reportServerError } from "@/lib/server/report";
import { say } from "@/lib/server/language";
import { planJourneys } from "@/lib/server/journeys";
import { ProviderError } from "@/lib/server/config";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { bikeOrNone, isValidPoint, isoOrUndefined } from "@/lib/server/input";
import type { GeoLocation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JourneyRequestBody {
  from?: Partial<GeoLocation>;
  to?: Partial<GeoLocation>;
  time?: string;
  arriveBy?: boolean;
  cursor?: string;
  count?: number;
  bike?: string;
}

/**
 * POST /api/journeys — meerdere reismogelijkheden met live vertragingen.
 *
 * De frontend praat alleen met deze route; de reisplanner-provider blijft op
 * de server.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "journeys");
  if (limited) return limited;

  let body: JourneyRequestBody;
  try {
    body = (await request.json()) as JourneyRequestBody;
  } catch {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  if (!isValidPoint(body.from)) {
    return NextResponse.json({ error: say(request, "api.needStart") }, { status: 400 });
  }
  if (!isValidPoint(body.to)) {
    return NextResponse.json({ error: say(request, "api.needDestination") }, { status: 400 });
  }

  try {
    const result = await planJourneys(body.from, body.to, {
      time: isoOrUndefined(body.time),
      arriveBy: body.arriveBy === true,
      cursor: typeof body.cursor === "string" ? body.cursor : undefined,
      count: typeof body.count === "number" ? body.count : undefined,
      bike: bikeOrNone(body.bike),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: say(request, error.key) }, { status: error.status });
    }
    reportServerError("api/journeys", error);
    return NextResponse.json({ error: say(request, "api.journeyFailed") }, { status: 500 });
  }
}
