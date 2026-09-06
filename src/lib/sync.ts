"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Activity, Exam, Settings, Task } from "./types";
import { normalizeActivity, normalizeExam, normalizeTask } from "./backup";

/**
 * Synchronisatie van de volledige agenda met Supabase. Alles staat in één rij
 * per gebruiker (tabel `user_data`, kolom `data` als JSON), wat precies aansluit
 * op het bestaande model en de import/export.
 */

const TABLE = "user_data";

/**
 * Wat je hebt weggegooid, en wanneer. Zonder dit spoor is samenvoegen een
 * unie: het andere apparaat kent het weggegooide item nog wel, dus komt het
 * bij de eerstvolgende sync gewoon terug.
 */
export interface Deletion {
  id: string;
  /** ISO-tijd van het weggooien. */
  at: string;
}

export interface SyncPayload {
  settings: Settings | null;
  activities: Activity[];
  tasks: Task[];
  exams: Exam[];
  /** Grafstenen van weggegooide activiteiten, taken en toetsen. */
  deletions?: Deletion[];
}

/**
 * Zo lang houden we een grafsteen aan. Lang genoeg voor een apparaat dat een
 * paar maanden in een la lag, kort genoeg om niet eindeloos te groeien.
 */
const TOMBSTONE_DAYS = 180;

/** Haalt de opgeslagen data van een gebruiker op; null wanneer er nog niets staat. */
export async function pullData(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncPayload | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.data) return null;

  const raw = data.data as Record<string, unknown>;
  // Defensief normaliseren, net als bij import: de app mag niet crashen op
  // onverwachte of oudere data.
  return {
    settings: (raw.settings as Settings) ?? null,
    activities: Array.isArray(raw.activities)
      ? (raw.activities as Record<string, unknown>[]).map(normalizeActivity)
      : [],
    tasks: Array.isArray(raw.tasks)
      ? (raw.tasks as Record<string, unknown>[]).map(normalizeTask)
      : [],
    exams: Array.isArray(raw.exams)
      ? (raw.exams as Record<string, unknown>[]).map(normalizeExam)
      : [],
    // Grafstenen van weggegooide items. Ontbreken ze (een rij van voor deze
    // versie), dan is dat gewoon een lege lijst.
    deletions: Array.isArray(raw.deletions)
      ? (raw.deletions as Deletion[]).filter(
          (entry) => !!entry && typeof entry.id === "string" && typeof entry.at === "string",
        )
      : [],
  };
}

/** Schrijft de volledige data van een gebruiker weg (maakt de rij aan of werkt bij). */
export async function pushData(
  supabase: SupabaseClient,
  userId: string,
  payload: SyncPayload,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      data: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(error.message);
}

/* --- Samenvoegen van lokaal en cloud (voorkomt dataverlies) ------------- */

function laterOf<T extends { id: string; updatedAt?: string }>(a: T, b: T): T {
  return (b.updatedAt ?? "") > (a.updatedAt ?? "") ? b : a;
}

/**
 * Union op id; bij dezelfde id wint de meest recent gewijzigde, en een item
 * verdwijnt als het ergens is weggegooid ná zijn laatste wijziging.
 *
 * Die volgorde is met opzet streng: alleen een grafsteen die jonger is dan het
 * item zelf telt. Heb je het item op het andere apparaat later nog aangepast,
 * dan wint die wijziging en komt het terug. Liever iets dat terugkomt en dat je
 * opnieuw weggooit, dan iets dat stilletjes verdwijnt.
 */
function mergeById<T extends { id: string; updatedAt?: string }>(
  local: T[],
  remote: T[],
  deletions: Map<string, string>,
): T[] {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? laterOf(existing, item) : item);
  }
  return [...byId.values()].filter((item) => {
    const deletedAt = deletions.get(item.id);
    return !deletedAt || deletedAt <= (item.updatedAt ?? "");
  });
}

/** De grafstenen van beide kanten samen; per id telt de laatste. */
function mergeDeletions(local: Deletion[], remote: Deletion[], now: string): Deletion[] {
  const cutoff = new Date(Date.parse(now) - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const byId = new Map<string, string>();
  for (const entry of [...local, ...remote]) {
    if (!entry?.id || typeof entry.at !== "string") continue;
    if (entry.at < cutoff) continue;
    const existing = byId.get(entry.id);
    if (!existing || entry.at > existing) byId.set(entry.id, entry.at);
  }
  return [...byId.entries()].map(([id, at]) => ({ id, at }));
}

function mergeSettings(local: Settings | null, remote: Settings | null): Settings | null {
  if (!remote) return local;
  if (!local) return remote;
  const savedById = new Map((local.savedPlaces ?? []).map((p) => [p.id, p]));
  for (const p of remote.savedPlaces ?? []) savedById.set(p.id, p);
  return {
    ...local,
    ...remote,
    // Behoud een thuislocatie als de ene kant hem mist.
    home: remote.home ?? local.home,
    savedPlaces: [...savedById.values()],
    categoryPlaces: { ...local.categoryPlaces, ...remote.categoryPlaces },
  };
}

/**
 * Voegt lokale en cloud-data samen, zodat inloggen op een tweede apparaat de
 * gegevens van beide kanten combineert in plaats van er een te overschrijven.
 */
export function mergePayload(
  local: SyncPayload,
  remote: SyncPayload,
  now: string = new Date().toISOString(),
): SyncPayload {
  const deletions = mergeDeletions(local.deletions ?? [], remote.deletions ?? [], now);
  const deletedAt = new Map(deletions.map((entry) => [entry.id, entry.at]));
  return {
    settings: mergeSettings(local.settings, remote.settings),
    activities: mergeById(local.activities, remote.activities, deletedAt),
    tasks: mergeById(local.tasks, remote.tasks, deletedAt),
    exams: mergeById(local.exams, remote.exams, deletedAt),
    deletions,
  };
}

