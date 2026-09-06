import { NextResponse } from "next/server";
import { requestLanguage, say } from "@/lib/server/language";
import { geocode } from "@/lib/server/geocoding";
import { ProviderError } from "@/lib/server/config";
import { enforceRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/geocode?q=Windesheim+Almere
 *
 * De frontend praat uitsluitend met deze route; provider en eventuele API-key
 * blijven op de server.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "geocode");
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  // ?stops=1 zet haltes en stations vooraan (reisplanner).
  const includeStops = params.get("stops") === "1";

  if (query.length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await geocode(query, 5, includeStops, requestLanguage(request));
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: say(request, error.key) }, { status: error.status });
    }
    console.error("[api/geocode]", error);
    return NextResponse.json({ error: say(request, "api.searchFailed") }, { status: 500 });
  }
}
