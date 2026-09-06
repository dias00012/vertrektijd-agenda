import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stats — telt hoe vaak er iets gebeurt in de app.
 *
 * Bewust zo min mogelijk. Er gaat geen apparaat-id mee, geen ip, geen cookie
 * en niets over je agenda: alleen de naam van wat er gebeurde. De server telt
 * dat op bij één getal per dag per gebeurtenis. Uit die tabel kun je aflezen
 * hoeveel mensen de app gebruiken, en niets over wie.
 *
 * Dat "hoeveel mensen" klopt doordat de app een gebeurtenis als `dag_geopend`
 * maar één keer per dag stuurt, bijgehouden in de browser zelf. De server hoeft
 * daardoor geen enkele bezoeker te herkennen.
 */

/** Alleen deze namen; zo kan niemand de tabel volschrijven met van alles. */
const ALLOWED = new Set([
  "dag_geopend",
  "activiteit_toegevoegd",
  "rooster_gekoppeld",
  "agenda_gekoppeld",
  "meldingen_aan",
  "meldingen_achtergrond_aan",
  "reis_gezocht",
  "rondleiding_gestart",
  "rooster_gewijzigd",
]);

export async function POST(request: Request) {
  const limit = checkRateLimit(`stats:${clientKey(request)}`, {
    limit: 120,
    windowMs: 60 * 60_000,
  });
  // Stilletjes negeren: statistieken zijn nooit een reden om de app te storen.
  if (!limit.ok) return NextResponse.json({ ok: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return NextResponse.json({ ok: true });

  let name: unknown;
  try {
    ({ name } = (await request.json()) as { name?: unknown });
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (typeof name !== "string" || !ALLOWED.has(name)) {
    return NextResponse.json({ ok: true });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Eén rij per dag per gebeurtenis, opgehoogd. Geen rij per bezoeker.
  await admin.rpc("bump_app_event", { event_name: name }).then(
    () => undefined,
    () => undefined,
  );

  return NextResponse.json({ ok: true });
}
