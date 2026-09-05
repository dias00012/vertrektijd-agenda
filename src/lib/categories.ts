import type { Activity, CategoryId, CustomCategory } from "./types";

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  emoji: string;
  /** Basiskleur; overige tinten worden hiervan afgeleid via color-mix. */
  color: string;
  /** Voorbeeldnaam als placeholder in het formulier. */
  placeholder: string;
  /** Heeft deze categorie doorgaans een locatie nodig? */
  locationExpected: boolean;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "school",
    label: "School",
    emoji: "\u{1F3EB}",
    color: "#3b82f6",
    placeholder: "Wiskunde",
    locationExpected: true,
  },
  {
    id: "werk",
    label: "Werk",
    emoji: "\u{1F4BC}",
    color: "#64748b",
    placeholder: "Werken",
    locationExpected: true,
  },
  {
    id: "gym",
    label: "Gym",
    emoji: "\u{1F3CB}\u{FE0F}",
    color: "#22c55e",
    placeholder: "Leg day",
    locationExpected: true,
  },
  {
    id: "koken",
    label: "Koken",
    emoji: "\u{1F373}",
    color: "#f97316",
    placeholder: "Pasta koken",
    locationExpected: false,
  },
  {
    id: "hobby",
    label: "Hobby",
    emoji: "\u{1F3AE}",
    color: "#a855f7",
    placeholder: "Gamen",
    locationExpected: false,
  },
];

const BY_ID = new Map<CategoryId, CategoryMeta>(CATEGORIES.map((c) => [c.id, c]));

/** Alleen de vijf ingebouwde types. Voor eigen types: `resolveCategory`. */
export function getCategory(id: CategoryId): CategoryMeta {
  return BY_ID.get(id) ?? CATEGORIES[0];
}

/** Zelfgemaakt type omzetten naar dezelfde vorm als een ingebouwd type. */
function toMeta(custom: CustomCategory): CategoryMeta {
  return {
    id: custom.id,
    label: custom.label,
    emoji: custom.emoji,
    color: custom.color,
    placeholder: custom.label,
    locationExpected: false,
  };
}

/** Alle types die de gebruiker kan kiezen: eerst de standaard, dan de eigen. */
export function allCategories(custom: CustomCategory[] = []): CategoryMeta[] {
  return [...CATEGORIES, ...custom.map(toMeta)];
}

/**
 * Zoekt een type op id, ook als het een zelfgemaakt type is. Bestaat het niet
 * (meer), dan valt hij terug op het eerste standaardtype, zodat een activiteit
 * altijd getoond kan worden.
 */
export function resolveCategory(id: CategoryId, custom: CustomCategory[] = []): CategoryMeta {
  const builtin = BY_ID.get(id);
  if (builtin) return builtin;
  const own = custom.find((c) => c.id === id);
  return own ? toMeta(own) : CATEGORIES[0];
}

/** Keuzepalet voor een eigen kleur per activiteit. */
export const ACTIVITY_COLORS: { value: string; label: string }[] = [
  { value: "#3b82f6", label: "Blauw" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#a855f7", label: "Paars" },
  { value: "#ec4899", label: "Roze" },
  { value: "#ef4444", label: "Rood" },
  { value: "#f97316", label: "Oranje" },
  { value: "#eab308", label: "Geel" },
  { value: "#22c55e", label: "Groen" },
  { value: "#14b8a6", label: "Turquoise" },
  { value: "#64748b", label: "Grijsblauw" },
];

/**
 * De kleur waarmee een activiteit getoond wordt: de eigen kleur van de
 * activiteit, anders die van zijn type. Geef `category` mee wanneer het een
 * zelfgemaakt type kan zijn.
 */
export function activityColor(
  activity: Pick<Activity, "category" | "color">,
  category?: CategoryMeta,
): string {
  return activity.color ?? (category ?? getCategory(activity.category)).color;
}
