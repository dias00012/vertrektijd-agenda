import { resolveCategory } from "./categories";
import { getLanguage } from "./i18n/locale";
import { translate } from "./i18n/dictionary";
import type { Activity, CategoryId, GeoLocation, SavedPlace, Settings } from "./types";

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

/**
 * Twee bewaarde punten zijn dezelfde plek wanneer ze tot op vijf decimalen
 * gelijk zijn — ruim binnen een meter. Het label mag verschillen: dezelfde
 * voordeur heet in de ene zoekopdracht net anders dan in de andere.
 */
export function samePoint(a: GeoLocation | null | undefined, b: GeoLocation | null | undefined): boolean {
  if (!a || !b) return false;
  return a.lat.toFixed(5) === b.lat.toFixed(5) && a.lon.toFixed(5) === b.lon.toFixed(5);
}

export interface Relocation {
  settings: Settings;
  activities: Activity[];
  /** Hoeveel activiteiten mee verhuisden. */
  movedActivities: number;
}

/**
 * Zet overal waar dit punt stond het nieuwe punt neer.
 *
 * Een bewaarde plek is geen verwijzing maar een kopie: bij het toevoegen van
 * een activiteit gaan de coordinaten mee. Verbeter je later het adres van die
 * plek, dan bleven al je bestaande activiteiten dus naar het oude punt reizen,
 * zonder dat je daar iets van zag. Daarom verhuist alles mee wat op dat punt
 * stond: thuis, de bewaarde plek zelf, je rooster, je agenda-abonnementen en
 * elke activiteit.
 *
 * De opgeslagen reistijd van een verhuisde activiteit vervalt: die hoort bij
 * het oude punt. De store berekent hem opnieuw.
 */
export function relocatePoint(
  settings: Settings,
  activities: Activity[],
  from: GeoLocation,
  to: GeoLocation,
  now: string = new Date().toISOString(),
): Relocation {
  // Hetzelfde punt opnieuw kiezen mag geen stempel op je hele agenda zetten;
  // dat zou bij het synchroniseren als een wijziging langskomen.
  if (samePoint(from, to) && from.label === to.label) {
    return { settings, activities, movedActivities: 0 };
  }

  const swap = (location: GeoLocation | null): GeoLocation | null =>
    samePoint(location, from) ? to : location;

  let movedActivities = 0;
  const nextActivities = activities.map((activity) => {
    if (!samePoint(activity.location, from)) return activity;
    movedActivities += 1;
    return {
      ...activity,
      location: to,
      travel: null,
      returnTravel: null,
      onwardTravel: null,
      travelError: null,
      updatedAt: now,
    };
  });

  const nextSettings: Settings = {
    ...settings,
    home: swap(settings.home),
    savedPlaces: settings.savedPlaces.map((place) =>
      samePoint(place.location, from)
        ? {
            ...place,
            location: to,
            // Heette de plek naar zijn adres, dan hoort de naam mee te gaan.
            // Een zelfgekozen naam ("Werk") blijft staan.
            name: place.name === from.label ? to.label : place.name,
          }
        : place,
    ),
    updatedAt: now,
  };

  if (settings.timetable && samePoint(settings.timetable.location, from)) {
    nextSettings.timetable = { ...settings.timetable, location: to };
  }
  if (settings.calendars) {
    nextSettings.calendars = settings.calendars.map((calendar) =>
      samePoint(calendar.location, from) ? { ...calendar, location: to } : calendar,
    );
  }

  return { settings: nextSettings, activities: nextActivities, movedActivities };
}
