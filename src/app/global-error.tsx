"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

/**
 * De laatste vangnet: een fout in de hoofdlayout zelf.
 *
 * `error.tsx` vangt fouten ín een pagina, maar niet die in de layout eromheen
 * -- die zit er in het foutscherm nog omheen, dus als hij zelf omvalt is er
 * niets om het in te tonen. Zonder dit bestand krijg je dan de kale foutpagina
 * van de browser, en Sentry hoort er ook niets over.
 *
 * Daarom staat hier alles op zichzelf:
 *
 * - eigen `<html>` en `<body>`, want dit vervangt de hoofdlayout;
 * - stijl in het bestand zelf, want het stijlblad wordt door die layout
 *   geladen en die is juist stuk;
 * - geen `useT()`, want de taalkeuze zit in een provider in diezelfde layout.
 *   De taal komt hier rechtstreeks uit de opslag, met een terugval op
 *   Nederlands.
 *
 * Bewust zonder link naar Vandaag: als de layout niet laadt, brengt navigeren
 * binnen de app je bij hetzelfde scherm. Opnieuw laden is het enige dat helpt.
 */

const TEKST = {
  nl: {
    titel: "Er ging iets mis",
    uitleg:
      "De app kon niet geladen worden. Je agenda staat veilig op je apparaat en in je account. Er is niets weg.",
    knop: "Opnieuw laden",
    code: "Foutcode:",
  },
  en: {
    titel: "Something went wrong",
    uitleg:
      "The app could not be loaded. Your calendar is safe on your device and in your account. Nothing is lost.",
    knop: "Reload",
    code: "Error code:",
  },
} as const;

/** Dezelfde sleutel als `src/lib/i18n/locale.ts`; die module laden kan hier niet. */
const TAAL_KEY = "agenda.language.v1";

function taal(): keyof typeof TEKST {
  try {
    return window.localStorage.getItem(TAAL_KEY) === "en" ? "en" : "nl";
  } catch {
    // Privémodus of geblokkeerde opslag. Nederlands is het startpunt.
    return "nl";
  }
}

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, scope: "global" });
  }, [error]);

  const t = TEKST[typeof window === "undefined" ? "nl" : taal()];

  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p aria-hidden style={{ fontSize: "2rem", margin: 0 }}>
            ⚠️
          </p>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0.5rem 0 0" }}>{t.titel}</h1>
          <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0.5rem 0 0" }}>{t.uitleg}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.25rem",
              // Ruim boven de 44 pixels die een duim nodig heeft; dit scherm
              // komt juist op een telefoon voorbij.
              minHeight: "3rem",
              padding: "0 1.25rem",
              border: "none",
              borderRadius: "0.75rem",
              background: "#0f172a",
              color: "#f8fafc",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.knop}
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.25rem", fontSize: "0.7rem", color: "#64748b" }}>
              {t.code} {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
