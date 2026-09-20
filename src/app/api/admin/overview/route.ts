import { NextResponse } from "next/server";
import { reportServerError } from "@/lib/server/report";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientKey } from "@/lib/server/rateLimit";
import { getProviderConfig } from "@/lib/server/config";
import { isAdmin } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/overview — hoeveel mensen gebruiken de app, en doet alles het?
 *
 * Alleen voor de adressen in `ADMIN_EMAILS`. De controle staat hier en niet
 * alleen op de pagina: een scherm dat zichzelf verbergt is geen beveiliging,
 * want de gegevens komen langs deze route en die kan iedereen aanroepen.
 *
 * De cijfers gaan over de app, nooit over een persoon. Het aantal accounts is
 * een telling zonder de rijen zelf op te halen, en `app_events` bevat sowieso
 * alleen een dag, een naam en een aantal — daar staat niemand in.
 */

/** Zo lang wachten we op een dienst voordat we hem als traag bestempelen. */
const PROBE_TIMEOUT_MS = 5000;
/** Langer dan dit is bereikbaar maar niet fijn. */
const SLOW_MS = 1500;

export type ServiceState = "ok" | "traag" | "storing";

export interface ServiceCheck {
  /** Naam zoals jij hem kent, niet de technische. */
  name: string;
  state: ServiceState;
  /** Hoe lang de dienst erover deed, in milliseconden. */
  ms: number;
  /** Waar het op stukliep; alleen bij een storing. */
  note?: string;
}

/**
 * Eén dienst aftikken.
 *
 * Bewust een echt verzoek en geen ping: een server die de verbinding aanneemt
 * maar daarna niets zinnigs teruggeeft is stuk, en dat wil je juist zien. De
 * tijdslimiet staat er zodat een hangende dienst niet het hele overzicht
 * ophoudt -- dan is hij gewoon "storing", wat het voor de gebruiker ook is.
 */
async function probe(name: string, url: string, userAgent: string): Promise<ServiceCheck> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    const ms = Date.now() - started;
    if (!response.ok) {
      return { name, state: "storing", ms, note: `antwoordde met ${response.status}` };
    }
    return { name, state: ms > SLOW_MS ? "traag" : "ok", ms };
  } catch (error) {
    return {
      name,
      state: "storing",
      ms: Date.now() - started,
      note: error instanceof Error ? error.message : "onbereikbaar",
    };
  }
}

export async function GET(request: Request) {
  const limit = checkRateLimit(`admin:${clientKey(request)}`, { limit: 60, windowMs: 60 * 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Te veel verzoeken." }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Niet ingesteld op deze server." }, { status: 501 });
  }

  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: lookupError } = await admin.auth.getUser(token);
  if (lookupError || !auth.user) {
    return NextResponse.json({ error: "Je sessie is verlopen." }, { status: 401 });
  }

  // Geen apart antwoord voor "je bestaat wel maar mag niet": dat vertelt een
  // vreemde dat deze pagina bestaat en dat hij het bij iemand anders moet
  // proberen.
  if (!isAdmin(auth.user.email)) {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  }

  const config = getProviderConfig();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10);

  // Alles tegelijk: de trage schakel bepaalt hoe lang je naar een leeg scherm
  // kijkt, en dat hoeft niet de som van alle schakels te zijn.
  const [accounts, events, ...services] = await Promise.all([
    admin.from("user_data").select("user_id", { count: "exact", head: true }),
    admin.from("app_events").select("day, name, count").gte("day", since).order("day"),
    probe(
      "OV-planner",
      `${config.motisBaseUrl}/api/v1/plan?fromPlace=52.3874,5.2653&toPlace=52.5168,5.4714&time=${new Date().toISOString()}`,
      config.userAgent,
    ),
    probe("Adressen zoeken", `${config.pdokBaseUrl}/suggest?q=Almere&rows=1`, config.userAgent),
  ]);

  if (accounts.error) reportServerError("api/admin/overview", accounts.error, { deel: "accounts" });
  if (events.error) reportServerError("api/admin/overview", events.error, { deel: "events" });

  return NextResponse.json({
    accounts: accounts.count ?? null,
    // Null en niet nul: "de tabel bestaat nog niet" is iets anders dan "er is
    // niets gebeurd", en dat verschil hoort op het scherm te blijven staan.
    events: events.error ? null : (events.data ?? []),
    services: [
      // De database heeft geen eigen probe nodig: als hij plat ligt, komt er
      // hierboven al niets terug. Dit is wat we er zojuist van merkten.
      {
        name: "Database",
        state: accounts.error ? "storing" : "ok",
        ms: 0,
        ...(accounts.error ? { note: accounts.error.message } : {}),
      } as ServiceCheck,
      ...(services as ServiceCheck[]),
    ],
    checkedAt: new Date().toISOString(),
  });
}
