import { NextResponse } from "next/server";
import { reportServerError } from "@/lib/server/report";
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
 *
 * Het antwoord zegt met `counted` of er werkelijk iets is opgehoogd. Dat is
 * geen formaliteit: de app onthoudt aan de hand daarvan dat hij vandaag geteld
 * heeft, en toen deze route altijd "gelukt" antwoordde -- ook terwijl de tabel
 * `app_events` nog niet bestond -- streepte de app die dag af zonder dat er
 * iets geteld was. Op het dashboard stond daarna nul terwijl de app de hele
 * dag gebruikt werd. Het verzoek blijft altijd een 200 geven: statistieken
 * zijn nooit een reden om de app te storen.
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
  if (!limit.ok) return NextResponse.json({ ok: true, counted: false });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return NextResponse.json({ ok: true, counted: false });

  let name: unknown;
  try {
    ({ name } = (await request.json()) as { name?: unknown });
  } catch {
    return NextResponse.json({ ok: true, counted: false });
  }
  if (typeof name !== "string" || !ALLOWED.has(name)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Eén rij per dag per gebeurtenis, opgehoogd. Geen rij per bezoeker.
  const { error } = await admin
    .rpc("bump_app_event", { event_name: name })
    .then((result) => result as { error: unknown }, (reason: unknown) => ({ error: reason }));

  // Wel loggen: dit is precies het geval waarin de tabel of de functie ontbreekt,
  // en dan wil je in de serverlogboeken zien waarom er niets geteld wordt.
  if (error) reportServerError("api/stats", error);

  return NextResponse.json({ ok: true, counted: !error });
}
