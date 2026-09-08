import { resolveCategory } from "./categories";
import { getLanguage } from "./i18n/locale";
import { translate } from "./i18n/dictionary";
import type { CategoryId, GeoLocation, SavedPlace, Settings } from "./types";

/**
 * Mist dit adres zijn straatnaam?
 *
 * De adreszoeker gaf soms een resultaat terug dat alleen uit een huisnummer
 * bestond: "60, Almere", "184, Lelystad". Dat is geen adres maar een los punt
 * dat de zoeker niet aan een straat kon koppelen — en dat punt kan honderden
 * meters van de bedoelde voordeur liggen. De app rekende daar vervolgens netjes
 * een looproute naartoe, dus je zag geen foutmelding maar een reistijd die
 * nergens uit bleek.
 *
 * Herkenbaar aan het eerste deel van de naam: staat daar geen enkele letter in,
 * dan is er geen straat gevonden.
 */
export function missesStreet(location: Pick<GeoLocation, "label"> | null): boolean {
  if (!location) return false;
  const first = location.label.split(",")[0]?.trim() ?? "";
  if (!first) return false;
  // Een naam als "Basic-Fit" of "Gran Canariastraat 60" bevat een straat; een
  // kaal huisnummer als "60", "184A" of "184-A" niet. Let op de straatnamen die
  // met een cijfer beginnen ("1e Kruisstraat"): daar staat meer achter, dus die
  // vallen buiten dit patroon.
  const bareHouseNumber = /^\d+\s*[-/]?\s*[a-zA-Z]?$/;
  return bareHouseNumber.test(first) || !/\p{L}/u.test(first);
}

/** Bewaarde locaties, meest recent bewaarde eerst. */
export function sortedPlaces(settings: Settings): SavedPlace[] {
  return [...settings.savedPlaces].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findPlace(settings: Settings, placeId: string | undefined): SavedPlace | null {
  if (!placeId) return null;
  return settings.savedPlaces.find((place) => place.id === placeId) ?? null;
}

/** De vaste locatie van een categorie, of null als die er nog niet is. */
export function placeForCategory(settings: Settings, category: CategoryId): SavedPlace | null {
  return findPlace(settings, settings.categoryPlaces[category]);
}

/** Voor welke categorieën is deze locatie de vaste plek? */
export function categoriesUsingPlace(settings: Settings, placeId: string): CategoryId[] {
  return (Object.entries(settings.categoryPlaces) as [CategoryId, string][])
    .filter(([, id]) => id === placeId)
    .map(([category]) => category);
}

/**
 * Hoe een bewaarde locatie in de app heet. Een adres als "19, Almere" zegt je
 * niets; waar het om gaat is wát het is. Dus: je eigen naam als je die gaf,
 * anders waar je er heen gaat ("School", "Werk"), en pas als laatste het adres.
 */
export function placeDisplayName(place: SavedPlace, settings: Settings): string {
  if (place.customName?.trim()) return place.customName.trim();

  const labels = categoriesUsingPlace(settings, place.id).map(
    (id) => resolveCategory(id, settings.customCategories).label,
  );
  if (labels.length > 0) return labels.join(" · ");

  return place.name;
}

/** Het icoon van de categorie waarvoor deze locatie de vaste plek is. */
export function placeEmoji(place: SavedPlace, settings: Settings): string {
  const [first] = categoriesUsingPlace(settings, place.id);
  if (!first) return "\u{1F4CD}";
  return resolveCategory(first, settings.customCategories).emoji;
}

/** Een snelkeuze in het locatieveld: één tik en je locatie staat er. */
export interface PlaceChoice {
  id: string;
  emoji: string;
  name: string;
  /** Het onderliggende adres, als toelichting. */
  address: string;
  location: GeoLocation;
}

/**
 * De snelkeuzes voor een locatieveld: eerst thuis, daarna je bewaarde plekken
 * op naam ("School", "Werk", "Gym") in plaats van op adres.
 */
export function placeChoices(settings: Settings, limit = 6): PlaceChoice[] {
  const choices: PlaceChoice[] = [];

  if (settings.home) {
    choices.push({
      id: "home",
      emoji: "\u{1F3E0}",
      name: translate(getLanguage(), "places.home"),
      address: settings.home.label,
      location: settings.home,
    });
  }

  for (const place of sortedPlaces(settings)) {
    // Thuis staat er al; dezelfde plek een tweede keer helpt niemand.
    if (
      settings.home &&
      place.location.lat === settings.home.lat &&
      place.location.lon === settings.home.lon
    ) {
      continue;
    }
    choices.push({
      id: place.id,
      emoji: placeEmoji(place, settings),
      name: placeDisplayName(place, settings),
      address: place.location.label,
      location: place.location,
    });
  }

  return choices.slice(0, limit);
}
