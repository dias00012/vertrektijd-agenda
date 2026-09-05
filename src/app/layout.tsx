import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AgendaProvider } from "@/hooks/useAgenda";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Vertrektijd \u2014 slimme agenda",
  description:
    "Persoonlijke agenda die automatisch berekent hoe laat je van huis moet vertrekken.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Vertrektijd" },
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
        <AgendaProvider>
          <AppShell>{children}</AppShell>
        </AgendaProvider>
      </body>
    </html>
  );
}
