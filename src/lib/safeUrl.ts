/**
 * Controle op een webadres dat een gebruiker aanlevert en dat de server gaat
 * ophalen.
 *
 * Zonder deze controle kun je de server laten rondneuzen in het netwerk waar
 * hij zelf in staat: interne diensten, of het metadata-adres van de
 * cloudprovider waar sleutels achter zitten. Daarom een harde lijst van wat
 * niet mag, in plaats van hopen dat het wel goed komt.
 */

import type { TranslationKey } from "./i18n/dictionary";

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: TranslationKey };

/** Adressen die niet op het open internet staan. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  // IPv6: link-local (fe80::) en uniek-lokaal (fc00::/7).
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 169.254.169.254 is bij vrijwel elke cloudprovider het metadata-adres.
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Mag de server dit adres ophalen? */
export function checkPublicUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    // webcal:// is hetzelfde als https, alleen met een andere naam ervoor.
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    return { ok: false, error: "api.badUrl" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "api.httpOnly" };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, error: "api.privateHost" };
  }
  return { ok: true, url };
}
