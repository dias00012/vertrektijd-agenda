import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AuthProvider } from "@/hooks/useAuth";
import { AgendaProvider } from "@/hooks/useAgenda";
import { AppShell } from "@/components/AppShell";
import { ServiceWorker } from "@/components/ServiceWorker";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
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
