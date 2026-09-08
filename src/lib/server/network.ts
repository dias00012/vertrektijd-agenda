import "server-only";
import { lookup } from "node:dns/promises";
import { isPrivateHost } from "../safeUrl";

/**
 * Wijst deze naam naar een adres binnen ons eigen netwerk?
 *
 * Alleen de naam bekijken is niet genoeg. Een doodgewone domeinnaam mag naar
 * 127.0.0.1 of naar het metadata-adres van de cloudprovider wijzen, en dan
 * haalt de server alsnog iets op waar niemand bij hoort te kunnen. Daarom
 * zoeken we de naam eerst op en controleren we elk adres dat eruit komt.
 *
 * Waterdicht is het niet: tussen deze controle en het ophalen kan een
 * naamserver een ander adres teruggeven (DNS-rebinding). Dat sluit je pas
 * echt uit door de verbinding aan het gecontroleerde adres vast te pinnen,
 * en dat kan `fetch` niet. Dit vangt wel alles wat je met een gewone
 * domeinnaam kunt proberen.
 */
export async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  // Een letterlijk IP-adres is al beoordeeld op de naam zelf.
  if (isPrivateHost(host)) return true;

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.some((entry) => isPrivateHost(entry.address));
  } catch {
    // Kunnen we de naam niet opzoeken, dan mislukt het ophalen zo meteen toch.
    return false;
  }
}

/**
 * Leest een antwoord uit met een harde grens, en stopt zodra die wordt
 * overschreden.
 *
 * `response.text()` leest eerst alles in het geheugen en kijkt pas daarna hoe
 * groot het was. Een bron die blijft zenden krijgt zo de server om, ook als
 * we het resultaat daarna weggooien. Een `content-length` meesturen is
 * vrijwillig, dus daar kun je niet op leunen.
 *
 * Geeft `null` terug wanneer de grens wordt overschreden.
 */
export async function readTextCapped(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
