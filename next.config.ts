import type { NextConfig } from "next";

/**
 * Beveiligingsheaders.
 *
 * Er stond er geen een. Voor een app die je hele weekrooster, je adres en je
 * deadlines bewaart -- en die naar de Play Store gaat -- is dat het eerste
 * waar iemand naar kijkt.
 *
 * De inhoudspolitie (CSP) is de belangrijkste en tegelijk de lastigste: te
 * streng en de app doet het niet meer. Daarom staat er precies wat de app echt
 * nodig heeft en niets meer:
 *
 *  - scripts alleen van onszelf. `unsafe-inline` moet, want Next zet zijn
 *    opstartcode en de gegevens van de server als inline script op de pagina.
 *  - stijlen alleen van onszelf, ook inline: de app zet kleuren per element.
 *  - verbindingen naar onszelf, naar Supabase (account en synchronisatie) en
 *    naar Sentry als dat aanstaat. De reisdiensten worden door de server
 *    gebeld, niet door de browser.
 *  - `frame-ancestors 'none'`: niemand zet deze app in een frame op zijn eigen
 *    site om er iets overheen te leggen.
 */
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sentry = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  /** Alleen de herkomst, nooit de sleutel die erin zit. */
  const origin = (url: string | undefined): string => {
    if (!url) return "";
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  };

  const connect = [
    "'self'",
    origin(supabase),
    // Supabase doet realtime over websockets.
    supabase ? origin(supabase).replace(/^https:/, "wss:") : "",
    origin(sentry),
  ].filter(Boolean);

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // data: voor de iconen die als data-URI in de app staan.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standaard ".next"; via NEXT_BUILD_DIR kan een losse build-map gekozen worden
  // zodat een verificatie-build een draaiende dev-server niet verstoort.
  distDir: process.env.NEXT_BUILD_DIR || ".next",

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          // Geen enkele pagina hoort in een frame van iemand anders.
          { key: "X-Frame-Options", value: "DENY" },
          // Geen type-raden: een geüpload bestand blijft wat de server zegt.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Stuurt bij het verlaten van de app alleen de herkomst mee, geen pad
          // -- en over http helemaal niets.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // De app vraagt zelf om je locatie; verder niets.
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
          },
          // Een jaar https, inclusief subdomeinen.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
