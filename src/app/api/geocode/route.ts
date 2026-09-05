import { NextResponse } from "next/server";
import { geocode } from "@/lib/server/geocoding";
import { ProviderError } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/geocode?q=Windesheim+Almere
 *
 * De frontend praat uitsluitend met deze route; provider en eventuele API-key
 * blijven op de server.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  // ?stops=1 zet haltes en stations vooraan (reisplanner).
  const includeStops = params.get("stops") === "1";

  if (query.length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await geocode(query, 5, includeStops);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/geocode]", error);
    return NextResponse.json({ error: "Er ging iets mis bij het zoeken." }, { status: 500 });
  }
}
