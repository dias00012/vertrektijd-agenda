import type { Activity, CategoryId, CustomCategory } from "./types";
import { getLanguage } from "./i18n/locale";
import { translate, type TranslationKey } from "./i18n/dictionary";

function word(key: TranslationKey): string {
  return translate(getLanguage(), key);
}

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

/** De vijf ingebouwde types. Een functie, want de namen volgen de taal. */
export function builtinCategories(): CategoryMeta[] {
  return [
    { id: "school", emoji: "\u{1F3EB}", color: "#3b82f6", locationExpected: true },
    { id: "werk", emoji: "\u{1F4BC}", color: "#64748b", locationExpected: true },
    { id: "gym", emoji: "\u{1F3CB}\u{FE0F}", color: "#22c55e", locationExpected: true },
    { id: "koken", emoji: "\u{1F373}", color: "#f97316", locationExpected: false },
    { id: "hobby", emoji: "\u{1F3AE}", color: "#a855f7", locationExpected: false },
  ].map((item) => ({
    ...item,
    label: word(`category.${item.id}` as TranslationKey),
    placeholder: word(`category.${item.id}.placeholder` as TranslationKey),
  }));
}

/** Alleen de vijf ingebouwde types. Voor eigen types: `resolveCategory`. */
export function getCategory(id: CategoryId): CategoryMeta {
  const all = builtinCategories();
  return all.find((item) => item.id === id) ?? all[0];
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
  return [...builtinCategories(), ...custom.map(toMeta)];
}

/**
 * Zoekt een type op id, ook als het een zelfgemaakt type is. Bestaat het niet
 * (meer), dan valt hij terug op het eerste standaardtype, zodat een activiteit
 * altijd getoond kan worden.
 */
export function resolveCategory(id: CategoryId, custom: CustomCategory[] = []): CategoryMeta {
  const all = builtinCategories();
  const builtin = all.find((item) => item.id === id);
  if (builtin) return builtin;
  const own = custom.find((c) => c.id === id);
  return own ? toMeta(own) : all[0];
}

/** Keuzepalet voor een eigen kleur per activiteit. */
export function activityColors(): { value: string; label: string }[] {
  return [
    { value: "#3b82f6", label: word("color.blue") },
    { value: "#6366f1", label: word("color.indigo") },
    { value: "#a855f7", label: word("color.purple") },
    { value: "#ec4899", label: word("color.pink") },
    { value: "#ef4444", label: word("color.red") },
    { value: "#f97316", label: word("color.orange") },
    { value: "#eab308", label: word("color.yellow") },
    { value: "#22c55e", label: word("color.green") },
    { value: "#14b8a6", label: word("color.turquoise") },
    { value: "#64748b", label: word("color.slate") },
  ];
}

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
