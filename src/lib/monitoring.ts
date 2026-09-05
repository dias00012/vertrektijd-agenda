"use client";

/**
 * Foutmonitoring.
 *
 * Zonder dit hoor je pas dat er iets stuk is als iemand het toevallig zegt.
 * De koppeling is bewust optioneel: staat er geen DSN in de omgeving, dan gaat
 * er niets naar buiten en blijft het bij een melding in de console. Zo hoeft
 * niemand een account bij een externe dienst te hebben om de app te draaien.
 *
 * Aanzetten: zet `NEXT_PUBLIC_SENTRY_DSN` in Vercel op de DSN uit je (gratis)
 * Sentry-project. De DSN is bedoeld om publiek te zijn — het is een adres om
 * heen te sturen, geen sleutel om iets mee op te halen.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

/** Waar de fout vandaan komt — nooit iets uit de agenda van de gebruiker. */
type Context = Record<string, string | number | boolean | undefined>;

/** Zet een DSN om in het ingest-endpoint van Sentry. */
function envelopeUrl(dsn: string): string | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    const key = url.username;
    if (!projectId || !key) return null;
    return `${url.protocol}//${url.host}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`;
  } catch {
    return null;
  }
}

export function reportError(error: unknown, context: Context = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[vertrektijd]", message, context);

  const endpoint = DSN ? envelopeUrl(DSN) : null;
  if (!endpoint || typeof fetch === "undefined") return;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();

  const body =
    JSON.stringify({ event_id: eventId, sent_at: sentAt }) +
    "\n" +
    JSON.stringify({ type: "event" }) +
    "\n" +
    JSON.stringify({
      event_id: eventId,
      timestamp: sentAt,
      platform: "javascript",
      level: "error",
      // Bewust geen agenda-inhoud, e-mailadres of locatie: alleen wat er stukging.
      exception: {
        values: [{ type: error instanceof Error ? error.name : "Error", value: message }],
      },
      extra: { ...context, stack: stack?.slice(0, 4000) },
      request: { url: typeof location !== "undefined" ? location.pathname : undefined },
    });

  // keepalive: het verzoek mag doorlopen terwijl de pagina sluit.
  fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => undefined);
}

/** Vangt fouten op die buiten React ontstaan (losse promises, event handlers). */
export function installGlobalErrorReporting(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, { source: "window.error" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { source: "unhandledrejection" });
  });
}
