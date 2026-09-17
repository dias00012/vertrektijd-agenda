import type { Activity, CategoryId, CategoryOverride, CustomCategory } from "./types";
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

/** Alle aanpassingen aan de standaardtypes, per id. */
export type Overrides = Partial<Record<CategoryId, CategoryOverride>>;

/**
 * De vijf ingebouwde types. Een functie, want de namen volgen de taal.
 *
 * Heb je er zelf iets aan veranderd, dan gaat dat erover heen. Alleen wat je
 * veranderd hebt: wie de kleur van "Gym" aanpast houdt gewoon de vertaalde
 * naam, en wie hem "Sporten" noemt houdt die naam ook in de Engelse app --
 * een naam die je zelf hebt gekozen is geen vertaling maar een besluit.
 */
export function builtinCategories(overrides: Overrides = {}): CategoryMeta[] {
  return [
    { id: "school", emoji: "\u{1F3EB}", color: "#3b82f6", locationExpected: true },
    { id: "werk", emoji: "\u{1F4BC}", color: "#64748b", locationExpected: true },
    { id: "gym", emoji: "\u{1F3CB}\u{FE0F}", color: "#22c55e", locationExpected: true },
    { id: "koken", emoji: "\u{1F373}", color: "#f97316", locationExpected: false },
    { id: "hobby", emoji: "\u{1F3AE}", color: "#a855f7", locationExpected: false },
  ].map((item) => {
    const mine = overrides[item.id] ?? {};
    return {
      ...item,
      label: mine.label?.trim() || word(`category.${item.id}` as TranslationKey),
      emoji: mine.emoji?.trim() || item.emoji,
      color: mine.color?.trim() || item.color,
      placeholder: word(`category.${item.id}.placeholder` as TranslationKey),
    };
  });
}

/** Is dit een van de vijf standaardtypes? */
export function isBuiltin(id: CategoryId): boolean {
  return ["school", "werk", "gym", "koken", "hobby"].includes(id);
}

/**
 * Een type dat de app niet (meer) kent, als iets neutraals.
 *
 * Zo'n id ontstaat op twee manieren: je gooit een zelfgemaakt type weg terwijl
 * er nog activiteiten op staan, of er komt een agenda binnen waarin een type
 * staat dat hier niet bestaat — een planner die `"sport"` schrijft in plaats
 * van `"gym"`, bijvoorbeeld.
 *
 * Tot nu toe werd zo'n activiteit als "School" getoond: blauw, met het
 * schoolgebouwtje ervoor. Dat is geen terugval maar een verkeerd antwoord —
 * je bijbaan als schooldag in je agenda — en je kon nergens zien dat er iets
 * niet klopte. Nu staat het type er gewoon zoals het is, in grijs.
 */
function unknownCategory(id: CategoryId): CategoryMeta {
  return {
    id,
    label: id,
    emoji: "\u{1F3F7}\u{FE0F}",
    color: "#94a3b8",
    placeholder: id,
    locationExpected: false,
  };
}

/** Alleen de vijf ingebouwde types. Voor eigen types: `resolveCategory`. */
export function getCategory(id: CategoryId, overrides: Overrides = {}): CategoryMeta {
  return builtinCategories(overrides).find((item) => item.id === id) ?? unknownCategory(id);
}

/**
 * Het tekentje voor een type zonder gekozen icoon: de eerste letter van de
 * naam.
 *
 * Een emoji was verplicht, en dat is een rare eis aan iemand die achter een
 * laptop zit: op een telefoon staat de emoji-toets naast de spatiebalk, op een
 * laptop moet je een sneltoets kennen. Wie die niet kende typte maar iets --
 * er stond hier een type "Huiswerk" met een 7 ervoor.
 *
 * De eerste letter in de kleur van het type is geen noodoplossing maar gewoon
 * een net icoon. `[...label]` en niet `label[0]`, anders valt een emoji of een
 * letter met een accent in tweeën uiteen.
 */
export function initialOf(label: string): string {
  const [first] = [...label.trim()];
  return first ? first.toUpperCase() : "\u2022";
}

/** Zelfgemaakt type omzetten naar dezelfde vorm als een ingebouwd type. */
function toMeta(custom: CustomCategory): CategoryMeta {
  return {
    id: custom.id,
    label: custom.label,
    // Geen icoon gekozen: dan de eerste letter van de naam. Bewust hier en niet
    // bij het opslaan, zodat het meeverandert als je je type hernoemt.
    emoji: (custom.emoji ?? "").trim() || initialOf(custom.label),
    color: custom.color,
    placeholder: custom.label,
    locationExpected: false,
  };
}

/** Alle types die de gebruiker kan kiezen: eerst de standaard, dan de eigen. */
export function allCategories(
  custom: CustomCategory[] = [],
  overrides: Overrides = {},
): CategoryMeta[] {
  return [...builtinCategories(overrides), ...custom.map(toMeta)];
}

/**
 * Zoekt een type op id, ook als het een zelfgemaakt type is. Bestaat het niet
 * (meer), dan komt het er neutraal uit — zie `unknownCategory`. De activiteit
 * blijft dus altijd zichtbaar, maar doet zich niet voor als iets anders.
 */
export function resolveCategory(
  id: CategoryId,
  custom: CustomCategory[] = [],
  overrides: Overrides = {},
): CategoryMeta {
  const builtin = builtinCategories(overrides).find((item) => item.id === id);
  if (builtin) return builtin;
  const own = custom.find((c) => c.id === id);
  return own ? toMeta(own) : unknownCategory(id);
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
