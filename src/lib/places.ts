import type { CategoryId, SavedPlace, Settings } from "./types";

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
