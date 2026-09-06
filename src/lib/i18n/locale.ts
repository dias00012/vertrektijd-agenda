/**
 * De taal die op dit moment actief is.
 *
 * Bewust een waarde op moduleniveau en niet alleen in React-context: functies
 * als `formatDateLabel` en `describeRecurrence` worden vanuit tientallen
 * plekken aangeroepen, ook buiten componenten. Ze een taal laten meegeven zou
 * elke aanroeper raken zonder dat het iets oplost: er is er altijd maar één
 * tegelijk actief.
 */

export type Language = "nl" | "en";

export const LANGUAGES: { id: Language; label: string; flag: string }[] = [
  { id: "nl", label: "Nederlands", flag: "\u{1F1F3}\u{1F1F1}" },
  { id: "en", label: "English", flag: "\u{1F1EC}\u{1F1E7}" },
];

/** Waar de keuze op dit apparaat wordt bewaard. */
export const LANGUAGE_KEY = "agenda.language.v1";

/**
 * Nederlands is het startpunt, ook op de server. Zo is de eerste weergave op
 * de server en in de browser gelijk; de gekozen taal wordt daarna gezet.
 */
let active: Language = "nl";

export function getLanguage(): Language {
  return active;
}

export function setLanguage(language: Language): void {
  active = language;
}

/** De opgeslagen keuze, anders de taal van de browser, anders Nederlands. */
export function detectLanguage(): Language {
  if (typeof window === "undefined") return "nl";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    if (stored === "nl" || stored === "en") return stored;
  } catch {
    // Privémodus: dan valt hij terug op de taal van de browser.
  }
  const preferred = navigator.languages ?? [navigator.language];
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "nl") return "nl";
    if (base === "en") return "en";
  }
  return "nl";
}
