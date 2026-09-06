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

  // Een IPv6-adres bevat altijd een dubbele punt, een hostnaam nooit. Zonder
  // dat onderscheid gold elke naam die met "fc" of "fd" begint als privé-adres
  // en werd een gewone site als fd.nl geweigerd.
  if (host.includes(":")) return isPrivateIpv6(host);
  return isPrivateIpv4(host);
}

function isPrivateIpv6(host: string): boolean {
  // Alles nul (::) en het eigen apparaat (::1).
  if (host === "::" || host === "::1") return true;
  // Link-local fe80::/10 en uniek-lokaal fc00::/7.
  if (host.startsWith("fe80:")) return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true;

  // Een IPv4-adres vermomd als IPv6 komt op precies hetzelfde apparaat uit.
  // ::ffff:127.0.0.1 schrijft de URL-lezer om naar ::ffff:7f00:1, en dat zag
  // er als tekst onschuldig uit terwijl het gewoon localhost is.
  const mapped = mappedIpv4(host);
  return mapped !== null && isPrivateIpv4(mapped);
}

/** ::ffff:127.0.0.1 en ::ffff:7f00:1 zijn allebei 127.0.0.1. */
function mappedIpv4(host: string): string | null {
  const dotted = /^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (dotted) return dotted[1];

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPrivateIpv4(host: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (ipv4.slice(1).some((part) => Number(part) > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 169.254.169.254 is bij vrijwel elke cloudprovider het metadata-adres.
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Multicast en gereserveerd: hier staat geen agenda.
  if (a >= 224) return true;
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
