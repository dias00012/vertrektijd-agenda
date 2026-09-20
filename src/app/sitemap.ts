import type { MetadataRoute } from "next";
import { NAV, EXTRA_ROUTES } from "@/lib/nav";

/**
 * De schermen die een zoekmachine mag kennen.
 *
 * Uit dezelfde lijst als het menu en de service worker, zodat er niet nog een
 * derde plek is waar dit uit elkaar kan lopen.
 *
 * Zonder `NEXT_PUBLIC_SITE_URL` heeft een sitemap geen zin -- de adressen
 * moeten absoluut zijn -- dus dan blijft hij leeg.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const basis = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!basis) return [];

  return [...NAV.map((item) => item.href), ...EXTRA_ROUTES].map((pad) => ({
    url: `${basis}${pad}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: pad === "/" ? 1 : 0.7,
  }));
}
