"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase-client voor login en synchronisatie.
 *
 * De URL en de "anon key" zijn bewust publiek: ze horen in de client thuis en
 * worden beschermd door Row Level Security in de database (elke gebruiker kan
 * alleen bij zijn eigen rij). Er staat dus geen geheim in de frontend.
 *
 * Zijn de env-variabelen niet gezet, dan is synchronisatie simpelweg
 * uitgeschakeld en werkt de app lokaal precies zoals voorheen.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** true wanneer synchronisatie is geconfigureerd. */
export const isSyncConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** De gedeelde client, of null wanneer sync niet is ingesteld. */
export function getSupabase(): SupabaseClient | null {
  if (!isSyncConfigured) return null;
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Sessie in localStorage; de app is volledig client-side.
        storageKey: "agenda.auth",
      },
    });
  }
  return client;
}
