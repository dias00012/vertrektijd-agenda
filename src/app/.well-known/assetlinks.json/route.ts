import { NextResponse } from "next/server";
import { assetLinks } from "@/lib/androidLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /.well-known/assetlinks.json — het bewijs dat deze site bij de Android-app hoort.
 *
 * Een TWA (de Android-verpakking van deze app) opent zonder adresbalk, en dat
 * mag alleen als de site zelf bevestigt dat hij bij die app hoort. Android
 * haalt dit bestand op en vergelijkt de vingerafdruk hieronder met de
 * handtekening van de geïnstalleerde app. Klopt het niet, dan krijgt de
 * gebruiker een browserbalk in beeld -- de app ziet er dan uit als een website.
 *
 * De vingerafdruk komt uit Play Console (App signing → SHA-256) en staat in
 * `ANDROID_SHA256_FINGERPRINT`. Staat die er niet, dan geven we een lege lijst:
 * dat is een geldig antwoord en beter dan een verzonnen vingerafdruk.
 */

/** Het pakket-id van de Android-app. Verandert nooit meer na publicatie. */
const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME?.trim() || "nl.vertrektijd.agenda";

export function GET() {
  const body = assetLinks(PACKAGE_NAME, process.env.ANDROID_SHA256_FINGERPRINT);

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      // Android mag dit best een dag onthouden, maar niet voor eeuwig: een
      // nieuwe ondertekensleutel moet binnen een dag doorkomen.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
