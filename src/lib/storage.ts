"use client";

import type { Activity, CalendarSubscription, Exam, Settings, Task } from "./types";

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
 * Schema-versie van de opgeslagen data. Wordt meegegeven bij export en gebruikt
 * bij import om te controleren of een bestand leesbaar is. Verhoogd naar 2 met
 * de komst van taken en toetsen; bestaande activiteiten en instellingen blijven
 * onder hun eigen v1-sleutels staan, dus er gaat geen data verloren.
 */
export const SCHEMA_VERSION = 2;

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

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Kon ${key} niet opslaan in localStorage`, error);
  }
}

export function loadActivities(): Activity[] {
  const stored = read<Activity[]>(ACTIVITIES_KEY, []);
  if (!Array.isArray(stored)) return [];
  // Defensief: oude of handmatig aangepaste data mag de app niet slopen.
  return stored
    .filter(
      (item): item is Activity =>
        !!item && typeof item.id === "string" && typeof item.date === "string",
    )
    .map((item) => ({
      // Activiteiten uit een oudere versie missen de nieuwere velden.
      ...item,
      color: item.color ?? null,
      source: item.source ?? null,
      travelMode: item.travelMode ?? null,
      recurrence: item.recurrence ?? null,
      exceptions: Array.isArray(item.exceptions) ? item.exceptions : [],
      returnTravel: item.returnTravel ?? null,
    }));
}

export function saveActivities(activities: Activity[]): void {
  write(ACTIVITIES_KEY, activities);
}

export function loadTasks(): Task[] {
  const stored = read<Task[]>(TASKS_KEY, []);
  // Ontbrekende of stukke data mag de app niet slopen: val terug op [].
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item): item is Task =>
      !!item && typeof item.id === "string" && typeof item.deadline === "string",
  );
}

export function saveTasks(tasks: Task[]): void {
  write(TASKS_KEY, tasks);
}

export function loadExams(): Exam[] {
  const stored = read<Exam[]>(EXAMS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item): item is Exam =>
      !!item && typeof item.id === "string" && typeof item.date === "string",
  );
}

export function saveExams(exams: Exam[]): void {
  write(EXAMS_KEY, exams);
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

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}
