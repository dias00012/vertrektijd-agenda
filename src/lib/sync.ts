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
