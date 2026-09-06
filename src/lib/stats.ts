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

/**
 * Telt een gebeurtenis. `oncePerDay` is bedoeld voor dingen waar je mensen mee
 * wilt tellen in plaats van handelingen.
 */
export function track(name: StatEvent, options: { oncePerDay?: boolean } = {}): void {
  if (typeof window === "undefined") return;

  if (options.oncePerDay) {
    const seen = seenToday();
    if (seen.has(name)) return;
    seen.add(name);
    remember(seen);
  }

  // Nooit ergens op wachten en nooit iets kapotmaken: een telling is een
  // extraatje, geen onderdeel van wat de gebruiker aan het doen is.
  void fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    keepalive: true,
  }).catch(() => undefined);
}
