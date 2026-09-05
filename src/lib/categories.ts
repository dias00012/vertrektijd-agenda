import type { Activity, CategoryId } from "./types";

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

export function getCategory(id: CategoryId): CategoryMeta {
  return BY_ID.get(id) ?? CATEGORIES[0];
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

/** De kleur waarmee een activiteit getoond wordt: eigen keuze, anders categorie. */
export function activityColor(activity: Pick<Activity, "category" | "color">): string {
  return activity.color ?? getCategory(activity.category).color;
}
