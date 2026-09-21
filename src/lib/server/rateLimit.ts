import "server-only";
import { NextResponse } from "next/server";
import { say } from "./language";
import { clientKey } from "../clientKey";
import { checkSharedRateLimit } from "./rateLimitStore";

// Doorgegeven zodat de routes hem via deze module kunnen blijven gebruiken.
export { clientKey };

/**
 * Verkeersdrempel voor onze eigen API-routes.
 *
 * Waarom dit nodig is: achter /api/* zitten gratis diensten (Nominatim, OSRM,
 * transitous) die op fair use draaien. Zonder drempel kan één script met onze
 * URL die diensten laten blokkeren — voor iedereen die de app gebruikt.
 *
 * Twee tellers, in deze volgorde:
 *
 *  - Staat er een Supabase-service-sleutel, dan telt de database mee over alle
 *    instances heen. Dat is de echte grens; zie `rateLimitStore.ts`.
 *  - Anders (of als de database niet antwoordt) een schuivend venster in het
 *    geheugen. Elke instance telt dan apart, dus met twintig instances is een
 *    grens van dertig per minuut in de praktijk zeshonderd -- een rem op
 *    misbruik, geen harde grens.
 *
 * Nooit allebei mislukken betekent dichtgooien: een database die piept mag niet
 * betekenen dat niemand meer kan reizen.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
/** Boven dit aantal ruimen we verlopen vensters op; voorkomt geheugengroei. */
const CLEANUP_THRESHOLD = 5000;

export interface RateLimitRule {
  /** Aantal toegestane aanvragen binnen het venster. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconden tot je het opnieuw mag proberen; alleen zinvol als `ok` false is. */
  retryAfter: number;
  remaining: number;
}

function cleanup(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  if (windows.size > CLEANUP_THRESHOLD) cleanup(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, retryAfter: 0, remaining: rule.limit - 1 };
  }

  existing.count += 1;
  if (existing.count > rule.limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  return { ok: true, retryAfter: 0, remaining: rule.limit - existing.count };
}

/** Standaardgrenzen per route. Ruim boven normaal gebruik, ver onder misbruik. */
export const LIMITS = {
  /** Zoeken tijdens typen; de client wacht al 400 ms tussen toetsaanslagen. */
  geocode: { limit: 30, windowMs: 60_000 },
  /** Reistijden: een weekoverzicht met OV kan er in één keer tien opvragen. */
  travel: { limit: 60, windowMs: 60_000 },
  /** Reisplanner: één zoekopdracht per klik, plus bladeren. */
  journeys: { limit: 25, windowMs: 60_000 },
  /** Rooster ophalen: doe je een paar keer, niet honderd keer per minuut. */
  rooster: { limit: 10, windowMs: 60_000 },
  /**
   * De klok die de meldingenwachtrij leegtrekt. Die belt een keer per minuut,
   * dus tien is ruim. Dit is een tweede slot naast het geheim: raden mag, maar
   * niet eindeloos.
   */
  pushSend: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Past de drempel toe en geeft een kant-en-klaar 429-antwoord terug wanneer
 * iemand eroverheen gaat. `null` betekent: gewoon doorgaan.
 */
export function enforceRateLimit(
  request: Request,
  route: keyof typeof LIMITS,
): NextResponse | null {
  const result = checkRateLimit(`${route}:${clientKey(request)}`, LIMITS[route]);
  return result.ok ? null : tooMany(request, result);
}

/**
 * Hetzelfde, maar met de gedeelde teller erbij.
 *
 * Apart van `enforceRateLimit` omdat hij moet wachten op de database, en niet
 * elke route dat wil of kan. Beide tellers doen mee: de geheugenteller vangt
 * een stortvloed op dezelfde instance meteen af, zonder eerst een rondje langs
 * Postgres.
 */
export async function enforceSharedRateLimit(
  request: Request,
  route: keyof typeof LIMITS,
): Promise<NextResponse | null> {
  const sleutel = `${route}:${clientKey(request)}`;
  const rule = LIMITS[route];

  const lokaal = checkRateLimit(sleutel, rule);
  if (!lokaal.ok) return tooMany(request, lokaal);

  const gedeeld = await checkSharedRateLimit(sleutel, rule);
  // `null` betekent: geen antwoord uit de database. Dan geldt wat het geheugen
  // zei, en dat was net al "mag".
  if (gedeeld && !gedeeld.ok) return tooMany(request, gedeeld);

  return null;
}

function tooMany(request: Request, result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: say(request, "api.tooMany", { seconds: result.retryAfter }) },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
  );
}
