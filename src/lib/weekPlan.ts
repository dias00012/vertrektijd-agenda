import type { Activity, ActivityDraft, CategoryId, Settings } from "./types";
import { placeForCategory } from "./places";
import { WEEKDAYS } from "./recurrence";

/**
 * De standaardweek: werk ma t/m do, school op vrijdag, vier keer sporten,
 * elke dag zelf koken en de hobby's verdeeld over de week.
 *
 * Bewust als data en niet als losse activiteiten: zo blijft het plan leesbaar
 * en kan het opnieuw toegepast worden zonder ergens tijden te hoeven overtypen.
 */
export interface PlannedActivity {
  category: CategoryId;
  title: string;
  /** Weekdagen volgens Date#getDay(): 0 = zondag ... 6 = zaterdag. */
  weekdays: number[];
  startTime: string;
  endTime: string;
  /**
   * "category" = de vaste locatie van de categorie gebruiken.
   * "none"     = thuis, dus geen locatie en geen reistijd.
   */
  location: "category" | "none";
  /** Korte toelichting waarom deze activiteit hier staat. */
  note?: string;
}

const MO = 1;
const TU = 2;
const WE = 3;
const TH = 4;
const FR = 5;
const SA = 6;
const SU = 0;

export const WEEK_PLAN: PlannedActivity[] = [
  {
    category: "werk",
    title: "Werken",
    weekdays: [MO, TU, WE, TH],
    startTime: "09:00",
    endTime: "17:00",
    location: "category",
  },
  {
    category: "school",
    title: "School",
    weekdays: [FR],
    startTime: "09:00",
    endTime: "17:00",
    location: "category",
  },
  {
    category: "gym",
    title: "Sporten",
    weekdays: [MO, TU, TH],
    startTime: "18:15",
    endTime: "19:30",
    location: "category",
    note: "Direct na thuiskomst, met woensdag als rustdag ertussen.",
  },
  {
    category: "gym",
    title: "Sporten",
    weekdays: [SA],
    startTime: "10:00",
    endTime: "11:15",
    location: "category",
    note: "De vierde training, in het weekend zonder tijdsdruk.",
  },
  {
    category: "koken",
    title: "Koken",
    weekdays: [MO, TU, TH],
    startTime: "20:00",
    endTime: "20:45",
    location: "none",
    note: "Na het sporten.",
  },
  {
    category: "koken",
    title: "Koken",
    weekdays: [WE, FR],
    startTime: "18:00",
    endTime: "18:45",
    location: "none",
    note: "Vroeger op de avonden zonder training.",
  },
  {
    category: "school",
    title: "Studeren",
    weekdays: [SA],
    startTime: "13:00",
    endTime: "15:00",
    location: "none",
    note: "Na het sporten en de lunch, met de rest van de middag vrij.",
  },
  {
    category: "school",
    title: "Studeren",
    weekdays: [SU],
    startTime: "10:30",
    endTime: "12:30",
    location: "none",
    note: "Met een frisse kop, ruim voor de nieuwe werkweek.",
  },
  {
    category: "koken",
    title: "Koken",
    weekdays: [SA, SU],
    startTime: "17:30",
    endTime: "18:30",
    location: "none",
  },
  {
    category: "hobby",
    title: "Lezen",
    weekdays: [MO, TH],
    startTime: "21:15",
    endTime: "22:15",
    location: "none",
    note: "Rustige afsluiting van een trainingsdag.",
  },
  {
    category: "hobby",
    title: "Gitaar spelen",
    weekdays: [TU],
    startTime: "21:15",
    endTime: "22:15",
    location: "none",
  },
  {
    category: "hobby",
    title: "Gamen",
    weekdays: [WE, FR],
    startTime: "19:30",
    endTime: "21:30",
    location: "none",
    note: "Langere blokken op de avonden dat je niet sport.",
  },
  {
    category: "hobby",
    title: "Gitaar spelen",
    weekdays: [SA],
    startTime: "20:00",
    endTime: "21:00",
    location: "none",
  },
  {
    category: "hobby",
    title: "Lezen",
    weekdays: [SU],
    startTime: "20:00",
    endTime: "21:00",
    location: "none",
    note: "Zondag blijft verder vrij.",
  },
];

/** Herkomst-markering van activiteiten die uit de weekplanning komen. */
export const WEEK_PLAN_SOURCE = "weekplan";

function sameWeekdays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * Hoort deze activiteit bij de weekplanning?
 *
 * Naast de herkomst-markering herkennen we ook activiteiten die vóór die
 * markering zijn aangemaakt, door ze te vergelijken met het plan zelf. Zo ruimt
 * opnieuw toepassen ook oudere dubbelingen op.
 */
export function isWeekPlanActivity(activity: Activity): boolean {
  if (activity.source === WEEK_PLAN_SOURCE) return true;

  return WEEK_PLAN.some(
    (planned) =>
      planned.category === activity.category &&
      planned.title === activity.title &&
      planned.startTime === activity.startTime &&
      planned.endTime === activity.endTime &&
      sameWeekdays(planned.weekdays, activity.recurrence?.weekdays ?? []),
  );
}

/** Categorieën waarvoor het plan een vaste locatie (en dus een vertrektijd) gebruikt. */
export const PLAN_LOCATION_CATEGORIES: CategoryId[] = [
  ...new Set(
    WEEK_PLAN.filter((planned) => planned.location === "category").map(
      (planned) => planned.category,
    ),
  ),
];

/**
 * Zet het plan om in activiteiten. De locatie komt uit de vaste locatie van de
 * categorie, zodat het plan jouw eigen werk-, school- en sportadres gebruikt.
 * Ontbreekt die, dan komt de activiteit er zonder locatie in en kun je hem
 * later aanvullen.
 */
export function buildWeekPlanDrafts(settings: Settings, startDate: string): ActivityDraft[] {
  return WEEK_PLAN.map((planned) => ({
    category: planned.category,
    title: planned.title,
    date: startDate,
    startTime: planned.startTime,
    endTime: planned.endTime,
    location:
      planned.location === "category"
        ? (placeForCategory(settings, planned.category)?.location ?? null)
        : null,
    color: null,
    recurrence: { freq: "weekly", weekdays: planned.weekdays, until: null },
  }));
}

/** Het plan per dag, voor een leesbaar overzicht in de instellingen. */
export function weekPlanByDay(): { weekday: number; label: string; items: PlannedActivity[] }[] {
  return WEEKDAYS.map((day) => ({
    weekday: day.value,
    label: day.long,
    items: WEEK_PLAN.filter((planned) => planned.weekdays.includes(day.value)).sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    ),
  }));
}
