"use client";

import type { Activity, CalendarSubscription, Exam, Settings, Task } from "./types";
import type { Deletion } from "./sync";
import { normalizeActivity, normalizeExam, normalizeTask } from "./backup";

/**
 * Persistente opslag. Voor de MVP is dit localStorage: de app werkt daarmee
 * direct, offline en zonder database. De store-laag erboven kent alleen deze
 * vier functies, zodat we later kunnen omschakelen naar een echte backend
 * (bijvoorbeeld voor synchronisatie met Google/Apple Calendar).
 */

const ACTIVITIES_KEY = "agenda.activities.v1";
const SETTINGS_KEY = "agenda.settings.v1";
const TASKS_KEY = "agenda.tasks.v1";
const EXAMS_KEY = "agenda.exams.v1";
/**
 * Van wie de gegevens op dit apparaat zijn. Uitloggen wist de agenda niet uit
 * het geheugen, dus logde daarna iemand anders in, dan werd andermans agenda
 * — thuisadres incluis — naar dat account gepusht. Met deze sleutel ziet de
 * app dat de gegevens van een ander zijn en neemt hij de cloud als waarheid.
 */
const OWNER_KEY = "agenda.owner.v1";
/**
 * Wat je hebt weggegooid. Zonder dit spoor is samenvoegen met de cloud een
 * unie en komt alles wat je weggooide terug zodra een ander apparaat het nog
 * kent.
 */
const DELETIONS_KEY = "agenda.deletions.v1";

export const DEFAULT_SETTINGS: Settings = {
  home: null,
  savedPlaces: [],
  categoryPlaces: {},
  customCategories: [],
  bufferMinutes: 10,
  travelMode: "car",
  transitBike: "none",
  timetable: null,
  calendars: [],
  reminderMinutes: null,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Kon ${key} niet lezen uit localStorage`, error);
    return fallback;
  }
}

/**
 * Geeft terug of het opslaan lukte. Dat is geen luxe: is de opslag vol of staat
 * de browser hem niet toe (privé-venster, "site-gegevens blokkeren"), dan
 * mislukte dit stil en was een avond invoeren na één keer herladen weg.
 */
function write(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Kon ${key} niet opslaan in localStorage`, error);
    return false;
  }
}

/** Het account waar de opgeslagen gegevens bij horen; null = nog nooit gesynct. */
export function loadOwner(): string | null {
  const stored = read<string | null>(OWNER_KEY, null);
  return typeof stored === "string" && stored ? stored : null;
}

export function saveOwner(userId: string | null): boolean {
  return write(OWNER_KEY, userId);
}

export function loadDeletions(): Deletion[] {
  const stored = read<Deletion[]>(DELETIONS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item): item is Deletion =>
      !!item && typeof item.id === "string" && typeof item.at === "string",
  );
}

export function saveDeletions(deletions: Deletion[]): boolean {
  return write(DELETIONS_KEY, deletions);
}

/**
 * Wat hier uit komt gaat door dezelfde controle als een importbestand.
 *
 * Dat leek eerst overdreven — dit heeft de app zelf weggeschreven. Maar het
 * kwam er ooit in via een import of uit de cloud, en het kan uit een oudere
 * versie komen of met de hand aangepast zijn. Zonder die controle sloopte één
 * activiteit met `startTime: "banaan"` of een locatie zonder coordinaten de
 * hele agenda: geen dagoverzicht, geen instellingen, alleen nog het
 * foutscherm. En dat blijft zo bij elke keer openen, want de rommel staat in
 * de opslag.
 */
export function loadActivities(): Activity[] {
  const stored = read<unknown[]>(ACTIVITIES_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(normalizeActivity);
}

export function saveActivities(activities: Activity[]): boolean {
  return write(ACTIVITIES_KEY, activities);
}

/** Zelfde controle als bij een importbestand; zie `loadActivities`. */
export function loadTasks(): Task[] {
  const stored = read<unknown[]>(TASKS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(normalizeTask);
}

export function saveTasks(tasks: Task[]): boolean {
  return write(TASKS_KEY, tasks);
}

/** Zelfde controle als bij een importbestand; zie `loadActivities`. */
export function loadExams(): Exam[] {
  const stored = read<unknown[]>(EXAMS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(normalizeExam);
}

export function saveExams(exams: Exam[]): boolean {
  return write(EXAMS_KEY, exams);
}

export function loadSettings(): Settings {
  const stored = read<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    // Instellingen uit een oudere versie kennen deze velden nog niet.
    savedPlaces: Array.isArray(stored.savedPlaces) ? stored.savedPlaces : [],
    categoryPlaces: stored.categoryPlaces ?? {},
    customCategories: Array.isArray(stored.customCategories) ? stored.customCategories : [],
    calendars: Array.isArray(stored.calendars)
      ? stored.calendars.filter(
          (item): item is CalendarSubscription =>
            !!item && typeof item.id === "string" && typeof item.url === "string",
        )
      : [],
    bufferMinutes:
      typeof stored.bufferMinutes === "number" && stored.bufferMinutes >= 0
        ? stored.bufferMinutes
        : DEFAULT_SETTINGS.bufferMinutes,
  };
}

export function saveSettings(settings: Settings): boolean {
  return write(SETTINGS_KEY, settings);
}
