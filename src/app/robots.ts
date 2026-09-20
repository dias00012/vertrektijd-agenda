import type { MetadataRoute } from "next";

/**
 * Wat zoekmachines mogen indexeren.
 *
 * De openbare kant mag gevonden worden; alles wat achter een account of een
 * sleutel zit niet. `/beheer` en `/wachtwoord` horen niet in een zoekresultaat,
 * en de API-routes hebben er niets te zoeken.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/beheer", "/wachtwoord", "/offline"],
    },
    sitemap: process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/sitemap.xml`
      : undefined,
  };
}
