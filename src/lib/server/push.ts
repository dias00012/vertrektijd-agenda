import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Serverkant van de push-meldingen.
 *
 * Alles loopt via de service-sleutel, en de tabellen staan niet open voor de
 * anon-sleutel: de browser praat uitsluitend via onze eigen routes. Zo kan
 * niemand de wachtrij van een ander uitlezen, ook al is een apparaat-id niet
 * meer dan een willekeurig getal.
 */

export const DEVICES_TABLE = "push_devices";
export const QUEUE_TABLE = "push_queue";

/** Zoveel berichten mag één apparaat tegelijk in de wachtrij hebben. */
export const MAX_QUEUE = 60;

/** Een apparaat-id is een uuid; alles anders wijzen we meteen af. */
export function isDeviceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/** De beheerclient, of null wanneer de omgeving niet is ingesteld. */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Staan de sleutels klaar om daadwerkelijk te kunnen versturen? */
export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      adminClient(),
  );
}
