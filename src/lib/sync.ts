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

export interface SyncPayload {
  settings: Settings | null;
  activities: Activity[];
  tasks: Task[];
  exams: Exam[];
}

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

/** Union op id; bij dezelfde id wint de meest recent gewijzigde. */
function mergeById<T extends { id: string; updatedAt?: string }>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? laterOf(existing, item) : item);
  }
  return [...byId.values()];
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
export function mergePayload(local: SyncPayload, remote: SyncPayload): SyncPayload {
  return {
    settings: mergeSettings(local.settings, remote.settings),
    activities: mergeById(local.activities, remote.activities),
    tasks: mergeById(local.tasks, remote.tasks),
    exams: mergeById(local.exams, remote.exams),
  };
}

