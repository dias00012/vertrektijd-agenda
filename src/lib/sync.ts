"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Activity, Exam, Settings, Task } from "./types";
import { normalizeActivity, normalizeExam, normalizeTask } from "./backup";
import { withRow, type Loaded, type Store } from "./optimistic";

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

/**
 * Haalt de opgeslagen data op, met de versie van de rij erbij.
 *
 * Die versie is `updated_at`, en die wordt gebruikt zoals hij bedoeld is:
 * straks schrijven we alleen terug als de rij nog precies zo in de database
 * staat. Zie `src/lib/optimistic.ts` voor waarom dat nodig bleek.
 */
export async function pullData(
  supabase: SupabaseClient,
  userId: string,
): Promise<Loaded<SyncPayload | null>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const version = (data?.updated_at as string | undefined) ?? null;
  if (!data?.data) return { data: null, version };

  const raw = data.data as Record<string, unknown>;
  // Defensief normaliseren, net als bij import: de app mag niet crashen op
  // onverwachte of oudere data.
  return {
    version,
    data: {
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
    },
  };
}

/**
 * Schrijft de volledige data weg, maar alleen als de rij nog is zoals je hem
 * las. `false` betekent: iemand was je voor, er is niets geschreven.
 *
 * Hiervoor was dit een botte upsert. De app haalde je agenda op, voegde samen
 * en schreef terug -- en tussen dat ophalen en dat terugschrijven zat een
 * gaatje. Schreef je telefoon daar net in, of Claude via de connector, dan was
 * die wijziging weg. Het samenvoegen maakte dat zeldzaam, niet onmogelijk.
 */
export async function pushData(
  supabase: SupabaseClient,
  userId: string,
  payload: SyncPayload,
  version: string | null,
): Promise<boolean> {
  const row = { data: payload, updated_at: new Date().toISOString() };

  // Nog geen rij: invoegen. Bestaat hij ondertussen toch -- een tweede apparaat
  // was net iets eerder -- dan botst de sleutel, en dat is het sein om het over
  // te doen, geen fout om de gebruiker mee lastig te vallen.
  if (version === null) {
    const { error } = await supabase.from(TABLE).insert({ user_id: userId, ...row });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }

  // `select()` geeft de gewijzigde rijen terug: nul betekent dat `updated_at`
  // niet meer klopte, en dus dat er iemand tussendoor schreef.
  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq("user_id", userId)
    .eq("updated_at", version)
    .select("user_id");

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Eén synchronisatieronde: ophalen, samenvoegen, wegschrijven -- en opnieuw
 * wanneer iemand ertussen kwam.
 *
 * `combine` bepaalt wat er met de verse cloudgegevens gebeurt. Dat verschilt
 * per plek: bij het inloggen kan de lokale agenda van een andere gebruiker
 * zijn, en dan is de cloud de waarheid.
 */
export async function syncOnce(
  supabase: SupabaseClient,
  userId: string,
  local: SyncPayload,
  combine: (local: SyncPayload, remote: SyncPayload | null) => SyncPayload,
  tries?: number,
): Promise<{ merged: SyncPayload; remote: SyncPayload | null }> {
  const store: Store<SyncPayload | null> = {
    load: () => pullData(supabase, userId),
    save: (data, version) => pushData(supabase, userId, data as SyncPayload, version),
  };

  return withRow(
    store,
    (remote) => {
      const merged = combine(local, remote);
      return { next: merged, outcome: { merged, remote } };
    },
    tries,
  );
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

  // Wie het laatst iets wijzigde, wint. Zonder dit won de cloud altijd, en
  // verdween elke instelling die je op dit apparaat had aangepast terwijl je
  // even offline was. Ontbreekt de stempel aan beide kanten (gegevens van voor
  // deze versie), dan blijft het oude gedrag gelden en wint de cloud.
  const localIsNewer = (local.updatedAt ?? "") > (remote.updatedAt ?? "");
  const [older, newer] = localIsNewer ? [remote, local] : [local, remote];

  // Lijstjes blijven wel van beide kanten: die groeien alleen maar.
  const savedById = new Map((older.savedPlaces ?? []).map((p) => [p.id, p]));
  for (const p of newer.savedPlaces ?? []) savedById.set(p.id, p);
  const categoriesById = new Map((older.customCategories ?? []).map((c) => [c.id, c]));
  for (const c of newer.customCategories ?? []) categoriesById.set(c.id, c);

  return {
    ...older,
    ...newer,
    // Behoud een thuislocatie als de ene kant hem mist.
    home: newer.home ?? older.home,
    savedPlaces: [...savedById.values()],
    customCategories: [...categoriesById.values()],
    categoryPlaces: { ...older.categoryPlaces, ...newer.categoryPlaces },
  };
}

/**
 * Een vingerafdruk van wat er in een payload zit: welke items, en hoe recent.
 *
 * Nodig om na het samenvoegen te kunnen zien óf er iets veranderd is. Zonder
 * die vraag zou elk wegschrijven de state opnieuw zetten, wat het volgende
 * wegschrijven uitlokt, en zo door.
 */
export function signature(data: SyncPayload): string {
  const stamp = (list: readonly { id: string; updatedAt?: string }[]) =>
    list
      .map((item) => `${item.id}@${item.updatedAt ?? ""}`)
      .sort()
      .join(",");
  return [stamp(data.activities), stamp(data.tasks), stamp(data.exams)].join("|");
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

