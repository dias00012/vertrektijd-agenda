import { NextResponse } from "next/server";
import { checkRateLimit, clientKey } from "@/lib/server/rateLimit";
import { say } from "@/lib/server/language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — draait de app, en wat is er ingesteld?
 *
 * Bewust alleen ja/nee per instelling. Er gaat nooit een waarde, sleutel of
 * fragment daarvan mee: weten dát iets is ingesteld helpt bij het opzetten,
 * weten wát erin staat helpt alleen een aanvaller.
 */
export async function GET(request: Request) {
  const limit = checkRateLimit(`health:${clientKey(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: say(request, "api.tooManyShort") }, { status: 429 });
  }

  const has = (name: string) => Boolean(process.env[name]?.trim());

  return NextResponse.json({
    ok: true,
    features: {
      /** Accounts en synchronisatie tussen apparaten. */
      sync: has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      /** De knop "Account verwijderen" in Instellingen. */
      accountDeletion: has("NEXT_PUBLIC_SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
      /** Meldingen terwijl de app dicht is. */
      pushNotifications:
        has("NEXT_PUBLIC_VAPID_PUBLIC_KEY") &&
        has("VAPID_PRIVATE_KEY") &&
        has("SUPABASE_SERVICE_ROLE_KEY"),
      /** De klok die de wachtrij elke minuut leegtrekt. */
      pushClock: has("PUSH_CRON_SECRET"),
      /** Tellers in je eigen database; zegt niets over of de tabel bestaat. */
      usageStats: has("SUPABASE_SERVICE_ROLE_KEY"),
      /** Foutmeldingen doorsturen naar Sentry. */
      errorReporting: has("NEXT_PUBLIC_SENTRY_DSN"),
      /** Herkenbare identificatie bij de gratis kaart- en OV-diensten. */
      userAgent: has("NOMINATIM_USER_AGENT"),
    },
  });
}
