import "server-only";
import { envelopeBody, envelopeUrl } from "@/lib/monitoring";

/**
 * Serverfouten doorgeven.
 *
 * De routes schreven naar `console.error`, en `monitoring.ts` draait alleen in
 * de browser. Ging de reisplanner op de server stuk, dan hoorde je het pas als
 * iemand het zei -- en op Vercel scrolt zo'n regel binnen een dag uit beeld.
 *
 * Dezelfde DSN als de browserkant, maar hier uit de serveromgeving gelezen
 * zodat hij ook werkt als er geen `NEXT_PUBLIC_`-variant gezet is.
 */
const DSN = (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN)?.trim();

type Context = Record<string, string | number | boolean | undefined>;

export function reportServerError(
  route: string,
  error: unknown,
  context: Context = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${route}]`, message, context);

  const endpoint = DSN ? envelopeUrl(DSN) : null;
  if (!endpoint) return;

  const body = envelopeBody(error, { ...context, route, side: "server" }, {
    eventId: crypto.randomUUID().replace(/-/g, ""),
    sentAt: new Date().toISOString(),
    path: route,
  });

  // Niet wachten: een gebruiker die op een station staat hoeft niet te wachten
  // tot onze foutmelding is afgeleverd. Gaat het versturen mis, dan blijft het
  // bij de regel in de log.
  void fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => undefined);
}
