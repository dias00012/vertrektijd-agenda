import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { checkPublicUrl } from "@/lib/safeUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooster  { url }
 *
 * Haalt een agenda-link (.ics) op en geeft de inhoud terug. De browser mag dit
 * niet zelf doen: roostersystemen staan geen verzoeken vanaf een andere website
 * toe.
 *
 * Deze route haalt een adres op dat de gebruiker aanlevert, en dat is precies
 * het soort route waarmee je een server kunt laten rondneuzen in zijn eigen
 * netwerk. Daarom: alleen http(s), geen adressen binnen een netwerk, geen
 * omleidingen die daar alsnog heen wijzen, en een harde grens op de omvang.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "rooster");
  if (limited) return limited;

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (typeof body.url !== "string" || body.url.trim().length === 0) {
    return NextResponse.json({ error: "Vul de link naar je rooster in." }, { status: 400 });
  }

  let target = checkPublicUrl(body.url);
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    let response: Response | null = null;

    // Zelf de omleidingen volgen, zodat we elke tussenstap kunnen controleren.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(target.url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5",
          "User-Agent":
            process.env.NOMINATIM_USER_AGENT?.trim() || "Vertrektijd/1.0 (agenda-app)",
        },
        cache: "no-store",
      });

      if (response.status < 300 || response.status >= 400) break;

      const next = response.headers.get("location");
      if (!next) break;
      const resolved = checkPublicUrl(new URL(next, target.url).toString());
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      target = resolved;
      response = null;
    }

    if (!response) {
      return NextResponse.json({ error: "De link stuurt te vaak door." }, { status: 400 });
    }
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { error: "Deze link vraagt om inloggen. Gebruik de persoonlijke agenda-link." },
        { status: 400 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `Het rooster kon niet worden opgehaald (${response.status}).` },
        { status: 502 },
      );
    }

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      return NextResponse.json({ error: "Dit bestand is te groot." }, { status: 400 });
    }

    const text = await response.text();
    if (text.length > MAX_BYTES) {
      return NextResponse.json({ error: "Dit bestand is te groot." }, { status: 400 });
    }
    if (!text.includes("BEGIN:VCALENDAR")) {
      return NextResponse.json(
        { error: "Op dit adres staat geen agenda. Controleer of je de iCal-link hebt gekopieerd." },
        { status: 400 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Het rooster reageerde niet op tijd." }, { status: 504 });
    }
    console.error("[api/rooster]", error);
    return NextResponse.json({ error: "Het rooster kon niet worden opgehaald." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
