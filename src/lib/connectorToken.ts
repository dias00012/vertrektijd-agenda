import { createHash, randomBytes } from "node:crypto";

/**
 * De sleutel waarmee Claude bij één agenda mag.
 *
 * Bewust zonder `server-only`, zodat de keuze los te testen is — net als bij
 * `clientKey`. Dit is precies het soort code waar een fout niet opvalt totdat
 * iemand hem misbruikt.
 *
 * Wat er in de database staat is een hash, niet het token zelf. Wie de tabel
 * in handen krijgt heeft daarmee nog geen toegang tot iemands agenda — en wij
 * kunnen het token ook niet nog eens tonen, wat precies klopt: je ziet hem één
 * keer, bij het aanmaken.
 *
 * SHA-256 zonder salt is hier de juiste keuze en niet de luie: dit is geen
 * wachtwoord dat een mens verzint, maar 256 bits toeval. Er valt niets te raden
 * en dus ook niets te versnellen met een regenboogtabel.
 */

/** Herkenbaar begin, zodat een gelekt token te vinden is in logs en repo's. */
const PREFIX = "vta_";

/** 32 bytes = 256 bits. Ruim voorbij wat iemand ooit afloopt. */
const BYTES = 32;

/** Een nieuw token. Alleen hier, en alleen één keer, bestaat de leesbare vorm. */
export function createConnectorToken(): string {
  return PREFIX + randomBytes(BYTES).toString("base64url");
}

/** De vorm waarin het token in de database staat. */
export function hashConnectorToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Het token uit een `Authorization: Bearer …`-header, of null.
 *
 * Streng op de vorm: alles wat niet op ons voorvoegsel begint is het token van
 * iets anders (een Supabase-sessie bijvoorbeeld) en heeft hier niets te zoeken.
 */
export function readConnectorToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  return token.startsWith(PREFIX) ? token : null;
}
