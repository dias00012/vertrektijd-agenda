import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RateLimitResult, RateLimitRule } from "./rateLimit";

/**
 * Een verkeersdrempel die over alle instances heen telt.
 *
 * De drempel in `rateLimit.ts` staat in het geheugen, en op een serverless
 * platform heeft elke instance zijn eigen geheugen. Met twintig instances is
 * een grens van dertig per minuut in de praktijk zeshonderd. Dat was prima
 * zolang er één gebruiker was; zodra er betalende gebruikers zijn is het je
 * enige rem op de rekening én op de gratis diensten waar de app op draait.
 *
 * Postgres telt hier, niet Redis: er staat al een database, er is al een
 * service-sleutel, en er hoeft dus geen tweede dienst bij die ook weer kan
 * omvallen. Eén upsert per aanvraag is voor dit aantal ruim voldoende.
 *
 * Valt de database weg, dan geldt de geheugendrempel weer. Dat is bewust: een
 * database die piept mag nooit betekenen dat niemand meer kan reizen.
 */

export const RATE_TABLE = "rate_limits";

let client: SupabaseClient | null | undefined;

/** De beheerclient, of null wanneer de omgeving niet is ingesteld. */
function adminClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  client =
    url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
  return client;
}

/** Staat de gedeelde teller aan? Zo niet, dan blijft het bij het geheugen. */
export function sharedLimitAvailable(): boolean {
  return adminClient() !== null;
}

/**
 * Telt deze aanvraag mee en zegt of hij mag.
 *
 * `null` betekent: de database kon geen antwoord geven. De aanroeper valt dan
 * terug op de teller in het geheugen in plaats van de deur dicht te gooien.
 */
export async function checkSharedRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult | null> {
  const admin = adminClient();
  if (!admin) return null;

  try {
    const { data, error } = await admin.rpc("bump_rate_limit", {
      limit_key: key,
      window_ms: rule.windowMs,
      max_count: rule.limit,
    });
    if (error || !data) return null;

    const rij = (Array.isArray(data) ? data[0] : data) as {
      allowed: boolean;
      remaining: number;
      retry_after: number;
    } | null;
    if (!rij || typeof rij.allowed !== "boolean") return null;

    return {
      ok: rij.allowed,
      // Nooit nul teruggeven bij een weigering: een Retry-After van 0 laat een
      // client meteen opnieuw proberen, en dan is de drempel geen drempel.
      retryAfter: rij.allowed ? 0 : Math.max(1, Math.ceil(rij.retry_after)),
      remaining: Math.max(0, rij.remaining),
    };
  } catch {
    // Netwerk weg, tabel er niet, functie niet aangemaakt: allemaal hetzelfde
    // antwoord. De aanroeper weet wat hij dan doet.
    return null;
  }
}

/** Alleen voor tests: de onthouden client vergeten. */
export function resetClientForTests(): void {
  client = undefined;
}
