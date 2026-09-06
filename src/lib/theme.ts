/**
 * Accentkleur van de app.
 *
 * De hele interface gebruikt één variabele (`--accent`) voor knoppen, actieve
 * tabbladen, focusranden en de nadruk op je vertrektijd. Door alleen die
 * variabele te wisselen verandert de hele app van kleur, zonder dat er ergens
 * een kleur hardgecodeerd staat.
 *
 * Per thema staan er twee tinten: een voor licht en een voor donker. In het
 * donker moet een kleur lichter zijn om nog leesbaar te blijven op een donkere
 * achtergrond.
 */

export interface Theme {
  id: string;
  /** Sleutel in het woordenboek, zodat de naam de taal volgt. */
  nameKey: string;
  light: string;
  dark: string;
}

export const THEMES: Theme[] = [
  { id: "blue", nameKey: "theme.blue", light: "#2563eb", dark: "#60a5fa" },
  { id: "indigo", nameKey: "theme.indigo", light: "#4f46e5", dark: "#818cf8" },
  { id: "purple", nameKey: "theme.purple", light: "#7c3aed", dark: "#a78bfa" },
  { id: "pink", nameKey: "theme.pink", light: "#db2777", dark: "#f472b6" },
  { id: "red", nameKey: "theme.red", light: "#dc2626", dark: "#f87171" },
  { id: "orange", nameKey: "theme.orange", light: "#ea580c", dark: "#fb923c" },
  { id: "green", nameKey: "theme.green", light: "#16a34a", dark: "#4ade80" },
  { id: "teal", nameKey: "theme.teal", light: "#0d9488", dark: "#2dd4bf" },
];

export const DEFAULT_THEME = "blue";
export const THEME_KEY = "agenda.theme.v1";

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/**
 * Zet de kleur op het document. Beide tinten worden gezet; de CSS kiest zelf
 * welke geldt op basis van licht of donker.
 */
export function applyTheme(id: string): void {
  if (typeof document === "undefined") return;
  const theme = findTheme(id);
  const root = document.documentElement;
  root.style.setProperty("--accent-light", theme.light);
  root.style.setProperty("--accent-dark", theme.dark);
  root.dataset.theme = theme.id;
}

/** De opgeslagen keuze, anders blauw. */
export function storedTheme(): string {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return window.localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
