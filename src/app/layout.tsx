import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AuthProvider } from "@/hooks/useAuth";
import { AgendaProvider } from "@/hooks/useAgenda";
import { AppShell } from "@/components/AppShell";
import { ServiceWorker } from "@/components/ServiceWorker";
import { THEMES, DEFAULT_THEME, THEME_KEY } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Vertrektijd, slimme agenda",
  description:
    "Persoonlijke agenda die automatisch berekent hoe laat je van huis moet vertrekken.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Vertrektijd" },
  icons: {
    // De SVG blijft scherp in de browser; de PNG's zijn wat Android en iOS op
    // het beginscherm zetten.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};


/**
 * Zet de gekozen kleur nog vóór React begint. Zonder dit zie je bij het openen
 * eerst het standaardblauw en daarna pas je eigen kleur.
 */
const themeScript = `
(function () {
  try {
    var themes = ${JSON.stringify(
      Object.fromEntries(THEMES.map((theme) => [theme.id, [theme.light, theme.dark]])),
    )};
    var id = localStorage.getItem(${JSON.stringify(THEME_KEY)}) || ${JSON.stringify(DEFAULT_THEME)};
    var tint = themes[id] || themes[${JSON.stringify(DEFAULT_THEME)}];
    document.documentElement.style.setProperty("--accent-light", tint[0]);
    document.documentElement.style.setProperty("--accent-dark", tint[1]);
    document.documentElement.dataset.theme = id;
  } catch (error) {
    // Privémodus of geblokkeerde opslag: dan geldt gewoon de standaardkleur.
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Het script hieronder zet de kleur op <html> voordat React begint, dus de
     * server-HTML en de eerste client-weergave verschillen daar met opzet.
     * Zonder deze markering meldt React dat als een fout.
     */
    <html lang="nl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LanguageProvider>
          <AuthProvider>
            <AgendaProvider>
              <AppShell>{children}</AppShell>
            </AgendaProvider>
          </AuthProvider>
        </LanguageProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
