"use client";

/**
 * Tellen hoe de app gebruikt wordt, zonder iemand te volgen.
 *
 * Er gaat alleen een naam mee: "dag_geopend", "rooster_gekoppeld". Geen
 * apparaat-id, geen cookie, niets over je agenda. De server telt er één getal
 * per dag mee op en kan daaruit onmogelijk afleiden wie je bent.
 *
 * "Hoeveel mensen openden de app vandaag" klopt doordat `dag_geopend` hier
 * hooguit één keer per dag verstuurd wordt; dat onthoudt de browser zelf. Zo
 * hoeft de server geen enkele bezoeker te herkennen.
 */

/** Namen die de server accepteert; hier voor de zekerheid dezelfde lijst. */
export type StatEvent =
  | "dag_geopend"
  | "activiteit_toegevoegd"
  | "rooster_gekoppeld"
  | "agenda_gekoppeld"
  | "meldingen_aan"
  | "meldingen_achtergrond_aan"
  | "reis_gezocht"
  | "rondleiding_gestart"
  | "rooster_gewijzigd";

/** Waar we bijhouden wat vandaag al geteld is. */
const KEY = "agenda.stats.v1";

function todayStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Wat er vandaag al één keer geteld is. */
function seenToday(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { day?: string; names?: string[] };
    if (parsed.day !== todayStamp()) return new Set();
    return new Set(parsed.names ?? []);
  } catch {
    return new Set();
  }
}

function remember(names: Set<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ day: todayStamp(), names: [...names] }));
  } catch {
    // Privémodus: dan telt hij vaker. Niet erg, het zijn schattingen.
  }
}

/** Wat er nu onderweg is, zodat één keer openen niet twee verzoeken oplevert. */
const onderweg = new Set<string>();

/**
 * Telt een gebeurtenis. `oncePerDay` is bedoeld voor dingen waar je mensen mee
 * wilt tellen in plaats van handelingen.
 *
 * "Vandaag geteld" wordt pas onthouden wanneer de server bevestigt dat er
 * werkelijk iets is opgehoogd. Eerst gebeurde dat vooraf, en dan is één
 * mislukte poging genoeg om die dag voorgoed kwijt te zijn: de browser denkt
 * dat het gebeurd is en probeert het niet meer. Zo ging het ook echt -- de
 * tabel `app_events` bestond nog niet, de server antwoordde toch "gelukt", en
 * het dashboard stond op nul terwijl de app de hele dag gebruikt werd.
 *
 * Het omgekeerde risico is dat iemand dubbel geteld wordt wanneer de server
 * het wél deed maar het antwoord onderweg sneuvelt. Dat is een stuk
 * zeldzamer -- en een telling die er één te veel heeft is minder misleidend
 * dan een telling die stil op nul blijft staan.
 */
export function track(name: StatEvent, options: { oncePerDay?: boolean } = {}): void {
  if (typeof window === "undefined") return;

  if (options.oncePerDay) {
    if (seenToday().has(name) || onderweg.has(name)) return;
    onderweg.add(name);
  }

  // Nooit ergens op wachten en nooit iets kapotmaken: een telling is een
  // extraatje, geen onderdeel van wat de gebruiker aan het doen is.
  void fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    keepalive: true,
  })
    .then(async (response) => {
      if (!options.oncePerDay) return;
      const payload = (await response.json().catch(() => null)) as { counted?: boolean } | null;
      if (payload?.counted !== true) return;
      const seen = seenToday();
      seen.add(name);
      remember(seen);
    })
    .catch(() => undefined)
    .finally(() => {
      onderweg.delete(name);
    });
}
