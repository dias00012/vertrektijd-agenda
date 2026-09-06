import "server-only";
import { NextResponse } from "next/server";
import { say } from "./language";
import { clientKey } from "../clientKey";

// Doorgegeven zodat de routes hem via deze module kunnen blijven gebruiken.
export { clientKey };

/**
 * Verkeersdrempel voor onze eigen API-routes.
 *
 * Waarom dit nodig is: achter /api/* zitten gratis diensten (Nominatim, OSRM,
 * transitous) die op fair use draaien. Zonder drempel kan één script met onze
 * URL die diensten laten blokkeren — voor iedereen die de app gebruikt.
 *
 * Bewust een simpel schuivend venster in het geheugen. Op een serverless
 * platform telt elke instance apart, dus het is geen waterdichte grens maar
 * wel precies wat het moet zijn: een rem op misbruik, niet op normaal gebruik.
 * Wordt de app groot, dan hoort hier een gedeelde teller (Redis/Upstash).
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
  if (result.ok) return null;

  return NextResponse.json(
    { error: say(request, "api.tooMany", { seconds: result.retryAfter }) },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
  );
}
