"use client";

import type { DayChange } from "./timetableChanges";

/**
 * De laatst gevonden roosterwijzigingen, tot je ze wegklikt.
 *
 * Bewust apart van de agenda-instellingen: dit is een mededeling, geen
 * instelling. Hij hoort niet mee te synchroniseren naar je andere apparaten,
 * want daar heb je hem misschien al gezien.
 */

const KEY = "agenda.roosterwijzigingen.v1";
/** Ouder dan dit heeft geen nieuwswaarde meer. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface ChangeLog {
  /** Wanneer we dit vonden (ISO). */
  foundAt: string;
  changes: DayChange[];
}

export function loadChanges(): ChangeLog | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChangeLog;
    if (!Array.isArray(parsed.changes) || parsed.changes.length === 0) return null;
    if (Date.now() - Date.parse(parsed.foundAt) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveChanges(changes: DayChange[]): void {
  if (typeof window === "undefined" || changes.length === 0) return;
  try {
    const entry: ChangeLog = { foundAt: new Date().toISOString(), changes };
    window.localStorage.setItem(KEY, JSON.stringify(entry));
    // Een eigen gebeurtenis, zodat het scherm het meteen oppikt: localStorage
    // laat de eigen tab niets weten.
    window.dispatchEvent(new CustomEvent("roosterwijziging"));
  } catch {
    // Privémodus: dan zie je het alleen zolang dit scherm openstaat.
  }
}

export function clearChanges(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("roosterwijziging"));
  } catch {
    // Niets aan te doen, en niets kapot.
  }
}
