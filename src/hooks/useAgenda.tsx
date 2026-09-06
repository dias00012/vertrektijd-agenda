"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchTravel } from "@/lib/api";
import { getLanguage } from "@/lib/i18n/locale";
import { translate, type TranslationKey } from "@/lib/i18n/dictionary";
import {
  DEFAULT_SETTINGS,
  loadActivities,
  loadDeletions,
  loadExams,
  loadOwner,
  loadSettings,
  loadTasks,
  saveOwner,
  saveActivities,
  saveDeletions,
  saveExams,
  saveSettings,
  saveTasks,
} from "@/lib/storage";
import {
  buildBackup,
  type BackupFile,
  type ImportMode,
  type ImportSummary,
} from "@/lib/backup";
import { needsTravelRefresh, travelPlanFor } from "@/lib/travel";
import { dayRoleFor } from "@/lib/agenda";
import { track } from "@/lib/stats";
import { allCategories, resolveCategory, type CategoryMeta } from "@/lib/categories";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { getSupabase } from "@/lib/supabase";
import { mergePayload, pullData, pushData, type Deletion } from "@/lib/sync";
import type {
  Activity,
  ActivityDraft,
  CategoryId,
  CustomCategory,
  Exam,
  GeoLocation,
  SavedPlace,
  Settings,
  Task,
  TaskStep,
} from "@/lib/types";

/** Een tekst in de taal die nu actief is. */
function say(key: TranslationKey): string {
  return translate(getLanguage(), key);
}

interface AgendaContextValue {
  activities: Activity[];
  settings: Settings;
  /** false zolang localStorage nog niet is uitgelezen (voorkomt hydration-flits). */
  hydrated: boolean;
  /** Ids waarvoor op dit moment een reistijd wordt opgehaald. */
  calculatingIds: Set<string>;
  addActivity: (draft: ActivityDraft) => Activity;
  /**
   * Vervangt een set activiteiten in één keer: verwijdert `remove` en voegt
   * `add` toe. Gebruikt door de weekplanning, zodat opnieuw toepassen de vorige
   * planning overschrijft in plaats van te verdubbelen.
   */
  replaceActivities: (options: {
    remove: string[];
    add: ActivityDraft[];
    source?: string;
  }) => void;
  updateActivity: (id: string, draft: ActivityDraft) => void;
  removeActivity: (id: string) => void;
  /** Haalt één dag uit een herhalende reeks, zonder de reeks te verwijderen. */
  removeOccurrence: (id: string, dateKey: string) => void;
  /**
   * De laatste verwijdering, zolang je hem nog terug kunt halen. Verwijderen
   * is het enige wat je in deze app echt kwijt kunt raken; een knop van een
   * paar seconden scheelt de schrik.
   */
  lastRemoved: { title: string; at: number } | null;
  /** Zet de laatste verwijdering terug. */
  undoRemove: () => void;
  /** Laat de laatste verwijdering staan; het balkje verdwijnt. */
  forgetRemoved: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /**
   * Bewaart een locatie voor hergebruik en maakt hem, als er een categorie
   * bij zit, de vaste locatie voor die categorie.
   */
  rememberPlace: (location: GeoLocation, category: CategoryId | null) => void;
  /** Geeft een bewaarde locatie een eigen naam; leeg maakt de naam weer los. */
  renamePlace: (placeId: string, name: string) => void;
  /** Verwijdert een bewaarde locatie en de verwijzingen ernaar. */
  forgetPlace: (placeId: string) => void;

  /* --- Activiteitstypes ------------------------------------------------- */
  /** Alle types: eerst de vijf standaardtypes, daarna je eigen types. */
  categories: CategoryMeta[];
  /** Zoekt een type op id; werkt ook voor zelfgemaakte types. */
  categoryFor: (id: CategoryId) => CategoryMeta;
  /** Voegt een zelfgemaakt type toe en geeft het terug. */
  addCustomCategory: (input: { label: string; emoji: string; color: string }) => CustomCategory;
  /** Verwijdert een zelfgemaakt type (bestaande activiteiten blijven staan). */
  removeCustomCategory: (id: string) => void;
  /** Forceert een herberekening, ook als een eerdere poging faalde. */
  retryTravel: (id: string) => void;

  /* --- Schoolwerk: taken en toetsen ------------------------------------- */
  tasks: Task[];
  exams: Exam[];
  addTask: (task: Task) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;
  setTaskStatus: (id: string, status: Task["status"]) => void;
  toggleTaskStep: (taskId: string, stepId: string) => void;
  addExam: (exam: Exam) => void;
  updateExam: (id: string, patch: Partial<Exam>) => void;
  removeExam: (id: string) => void;
  setExamStatus: (id: string, status: Exam["status"]) => void;

  /* --- Back-up & synchronisatie ----------------------------------------- */
  /** Bouwt het exportobject met de volledige, actuele data. */
  exportData: () => BackupFile;
  /** Leest een bestand in (samenvoegen of vervangen) en geeft een samenvatting. */
  importData: (data: BackupFile, mode: ImportMode) => ImportSummary;

  /* --- Synchronisatie --------------------------------------------------- */
  sync: {
    /** "off" = niet ingelogd/niet ingesteld; anders de live status. */
    status: "off" | "idle" | "syncing" | "error";
    error: string | null;
    lastSyncedAt: string | null;
  };
}

const AgendaContext = createContext<AgendaContextValue | null>(null);

/** Twee locaties op dezelfde plek gelden als dezelfde bewaarde locatie. */
function placeKey(location: GeoLocation): string {
  return `${location.lat.toFixed(5)},${location.lon.toFixed(5)}`;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Voegt inkomende records samen met bestaande op basis van id: bestaande worden
 * bijgewerkt, nieuwe toegevoegd. Puur, dus veilig binnen een state-updater.
 */
function upsertById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

/** Verwijdert velden met waarde null/undefined uit een object (ondiep). */
function dropNullish<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

/** Telt hoeveel inkomende records nieuw zijn en hoeveel er bestaande bijwerken. */
function countUpsert<T extends { id: string }>(
  current: T[],
  incoming: T[],
): { added: number; updated: number } {
  const ids = new Set(current.map((item) => item.id));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    if (ids.has(item.id)) updated += 1;
    else added += 1;
  }
  return { added, updated };
}

export function AgendaProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Wat je weggooide, zodat het niet terugkomt bij de eerstvolgende sync.
  const [deletions, setDeletions] = useState<Deletion[]>([]);
  const [calculatingIds, setCalculatingIds] = useState<Set<string>>(new Set());

  const { user } = useAuth();
  const { language } = useLanguage();
  const supabase = getSupabase();
  const [syncStatus, setSyncStatus] = useState<"off" | "idle" | "syncing" | "error">("off");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  /** Onderdrukt de push-naar-server terwijl we net data van de server toepassen. */
  const applyingRemote = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Sleutels waarvoor de berekening faalde; niet automatisch opnieuw proberen. */
  const failedKeys = useRef<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    setActivities(loadActivities());
    setDeletions(loadDeletions());
    setSettings(loadSettings());
    setTasks(loadTasks());
    setExams(loadExams());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveActivities(activities);
  }, [activities, hydrated]);

  useEffect(() => {
    if (hydrated) saveDeletions(deletions);
  }, [deletions, hydrated]);

  useEffect(() => {
    if (hydrated) saveSettings(settings);
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated) saveTasks(tasks);
  }, [tasks, hydrated]);

  useEffect(() => {
    if (hydrated) saveExams(exams);
  }, [exams, hydrated]);

  const markCalculating = useCallback((id: string, active: boolean) => {
    setCalculatingIds((current) => {
      const next = new Set(current);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /**
   * Haalt de reistijd op voor een activiteit en schrijft het resultaat terug.
   * Wordt automatisch aangeroepen zodra locatie, thuislocatie of vervoersmiddel
   * verandert.
   */
  const computeTravel = useCallback(
    async (activity: Activity, currentSettings: Settings, onward?: GeoLocation | null) => {
      const plan = travelPlanFor(activity, currentSettings, new Date(), onward);
      if (!plan || !currentSettings.home || !activity.location) return;
      if (inFlight.current.has(activity.id)) return;

      inFlight.current.add(activity.id);
      markCalculating(activity.id, true);

      try {
        // Heen en terug apart: de terugweg kan afwijken (eenrichtingsverkeer),
        // en bij OV is het een heel andere rit op een ander tijdstip.
        const [outbound, inbound, ahead] = await Promise.all([
          fetchTravel(currentSettings.home, activity.location, {
            mode: plan.mode,
            arriveBy: plan.arriveBy,
            bike: plan.outboundBike,
          }),
          fetchTravel(activity.location, currentSettings.home, {
            mode: plan.mode,
            departAt: plan.departAt,
            bike: plan.returnBike,
          }),
          // Ga je hierna rechtstreeks ergens anders heen, dan is dat een derde
          // rit: van hier naar daar, zonder tussenstop thuis.
          plan.onwardTo
            ? fetchTravel(activity.location, plan.onwardTo, {
                mode: plan.mode,
                departAt: plan.departAt,
                bike: plan.onwardBike,
              })
            : Promise.resolve(null),
        ]);
        const computedAt = new Date().toISOString();
        failedKeys.current.delete(plan.outboundKey);
        setActivities((current) =>
          current.map((item) =>
            item.id === activity.id
              ? {
                  ...item,
                  travel: {
                    durationMinutes: outbound.durationMinutes,
                    distanceKm: outbound.distanceKm,
                    mode: outbound.mode,
                    provider: outbound.provider,
                    legs: outbound.legs,
                    transfers: outbound.transfers,
                    plannedDeparture: outbound.plannedDeparture,
                    plannedArrival: outbound.plannedArrival,
                    computedAt,
                    key: plan.outboundKey,
                  },
                  returnTravel: {
                    durationMinutes: inbound.durationMinutes,
                    distanceKm: inbound.distanceKm,
                    mode: inbound.mode,
                    provider: inbound.provider,
                    legs: inbound.legs,
                    transfers: inbound.transfers,
                    plannedDeparture: inbound.plannedDeparture,
                    plannedArrival: inbound.plannedArrival,
                    computedAt,
                    key: plan.returnKey,
                  },
                  onwardTravel:
                    ahead && plan.onwardKey
                      ? {
                          durationMinutes: ahead.durationMinutes,
                          distanceKm: ahead.distanceKm,
                          mode: ahead.mode,
                          provider: ahead.provider,
                          legs: ahead.legs,
                          transfers: ahead.transfers,
                          plannedDeparture: ahead.plannedDeparture,
                          plannedArrival: ahead.plannedArrival,
                          computedAt,
                          key: plan.onwardKey,
                        }
                      : null,
                  travelError: null,
                }
              : item,
          ),
        );
      } catch (error) {
        failedKeys.current.add(plan.outboundKey);
        const message =
          error instanceof Error ? error.message : say("error.travel");
        setActivities((current) =>
          current.map((item) =>
            item.id === activity.id
              ? {
                  ...item,
                  travel: null,
                  returnTravel: null,
                  onwardTravel: null,
                  travelError: message,
                }
              : item,
          ),
        );
      } finally {
        inFlight.current.delete(activity.id);
        markCalculating(activity.id, false);
      }
    },
    [markCalculating],
  );

  // Reactieve herberekening: elke activiteit met een verouderde reistijdsleutel
  // wordt opnieuw doorgerekend. Dit dekt zowel het wijzigen van een activiteit
  // als het wijzigen van de thuislocatie in de instellingen.
  useEffect(() => {
    if (!hydrated || !settings.home) return;
    const now = new Date();
    for (const activity of activities) {
      // De uren midden op een schooldag hebben geen eigen reis: je bent er al.
      // Zonder deze regel haalt een gekoppeld rooster tientallen routes op voor
      // hetzelfde ritje van huis naar school.
      const role = dayRoleFor(activity, activities, now);
      if (!activity.location || (role && !role.outbound && !role.inbound)) continue;

      const onward = role?.onward ?? null;
      if (!needsTravelRefresh(activity, settings, now, onward)) continue;
      const plan = travelPlanFor(activity, settings, now, onward);
      if (plan && failedKeys.current.has(plan.outboundKey)) continue;
      void computeTravel(activity, settings, onward);
    }
  }, [activities, settings, hydrated, computeTravel]);

  const addActivity = useCallback((draft: ActivityDraft): Activity => {
    // Alleen wat je zelf toevoegt telt; een geïmporteerd rooster zou de teller
    // met honderden tegelijk laten oplopen en niets zeggen.
    if (!draft.source) track("activiteit_toegevoegd");
    const now = new Date().toISOString();
    const activity: Activity = {
      id: createId(),
      ...draft,
      source: draft.source ?? null,
      exceptions: [],
      travel: null,
      returnTravel: null,
      travelError: null,
      bufferMinutes: null,
      createdAt: now,
      updatedAt: now,
    };
    setActivities((current) => [...current, activity]);
    return activity;
  }, []);

  const replaceActivities = useCallback(
    ({ remove, add, source }: { remove: string[]; add: ActivityDraft[]; source?: string }) => {
      const now = new Date().toISOString();
      const created: Activity[] = add.map((draft) => ({
        id: createId(),
        ...draft,
        source: source ?? null,
        exceptions: [],
        travel: null,
        returnTravel: null,
        travelError: null,
        bufferMinutes: null,
        createdAt: now,
        updatedAt: now,
      }));
      const removing = new Set(remove);
      setActivities((current) => [
        ...current.filter((item) => !removing.has(item.id)),
        ...created,
      ]);
    },
    [],
  );

  const updateActivity = useCallback((id: string, draft: ActivityDraft) => {
    setActivities((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const locationChanged =
          item.location?.lat !== draft.location?.lat || item.location?.lon !== draft.location?.lon;
        return {
          ...item,
          ...draft,
          // Overgeslagen dagen blijven alleen relevant zolang de reeks bestaat.
          exceptions: draft.recurrence ? item.exceptions : [],
          // Alleen de reistijd weggooien wanneer de bestemming echt wijzigde.
          // Een andere starttijd verschuift enkel de (afgeleide) vertrektijd.
          travel: locationChanged ? null : item.travel,
          returnTravel: locationChanged ? null : item.returnTravel,
          travelError: locationChanged ? null : item.travelError,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }, []);

  /** Wat er als laatste weg is, zodat het terug kan. */
  const undoable = useRef<
    { kind: "activity"; activity: Activity } | { kind: "occurrence"; id: string; date: string } | null
  >(null);
  const [lastRemoved, setLastRemoved] = useState<{ title: string; at: number } | null>(null);

  /** Een grafsteen erbij, zodat de cloud dit niet terugstuurt. */
  const recordDeletion = useCallback((id: string) => {
    const at = new Date().toISOString();
    setDeletions((current) => [...current.filter((entry) => entry.id !== id), { id, at }]);
  }, []);

  /** En weer weg bij ongedaan maken; anders wist de sync het teruggehaalde. */
  const forgetDeletion = useCallback((id: string) => {
    setDeletions((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const removeActivity = useCallback((id: string) => {
    setActivities((current) => {
      const going = current.find((item) => item.id === id);
      if (going) {
        undoable.current = { kind: "activity", activity: going };
        setLastRemoved({ title: going.title, at: Date.now() });
      }
      return current.filter((item) => item.id !== id);
    });
    recordDeletion(id);
  }, [recordDeletion]);

  const undoRemove = useCallback(() => {
    const entry = undoable.current;
    undoable.current = null;
    setLastRemoved(null);
    if (!entry) return;

    if (entry.kind === "activity") {
      setActivities((current) =>
        current.some((item) => item.id === entry.activity.id)
          ? current
          : [...current, entry.activity],
      );
      // De grafsteen moet mee weg, anders wist de eerstvolgende sync precies
      // wat je net hebt teruggehaald: hij is jonger dan de activiteit zelf.
      forgetDeletion(entry.activity.id);
      return;
    }
    // Eén dag terugzetten betekent: de uitzondering weer weghalen.
    setActivities((current) =>
      current.map((item) =>
        item.id === entry.id
          ? { ...item, exceptions: item.exceptions.filter((day) => day !== entry.date) }
          : item,
      ),
    );
  }, [forgetDeletion]);

  const forgetRemoved = useCallback(() => {
    undoable.current = null;
    setLastRemoved(null);
  }, []);

  const removeOccurrence = useCallback((id: string, dateKey: string) => {
    setActivities((current) => {
      const series = current.find((item) => item.id === id);
      if (series && !series.exceptions.includes(dateKey)) {
        undoable.current = { kind: "occurrence", id, date: dateKey };
        setLastRemoved({ title: series.title, at: Date.now() });
      }
      return current.map((item) =>
        item.id === id && !item.exceptions.includes(dateKey)
          ? {
              ...item,
              exceptions: [...item.exceptions, dateKey],
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    // Nieuwe thuislocatie betekent: alle eerdere mislukkingen mogen opnieuw.
    failedKeys.current.clear();
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const rememberPlace = useCallback((location: GeoLocation, category: CategoryId | null) => {
    setSettings((current) => {
      const key = placeKey(location);
      const existing = current.savedPlaces.find((place) => placeKey(place.location) === key);
      const place: SavedPlace = existing ?? {
        id: createId(),
        name: location.label,
        location,
        createdAt: new Date().toISOString(),
      };

      return {
        ...current,
        savedPlaces: existing ? current.savedPlaces : [...current.savedPlaces, place],
        categoryPlaces: category
          ? { ...current.categoryPlaces, [category]: place.id }
          : current.categoryPlaces,
      };
    });
  }, []);

  /** Een bewaarde locatie een eigen naam geven ("Werk", "Bijbaan"). */
  const renamePlace = useCallback((placeId: string, name: string) => {
    const trimmed = name.trim();
    setSettings((current) => ({
      ...current,
      savedPlaces: current.savedPlaces.map((place) =>
        place.id === placeId ? { ...place, customName: trimmed || undefined } : place,
      ),
    }));
  }, []);

  const forgetPlace = useCallback((placeId: string) => {
    setSettings((current) => {
      const categoryPlaces = { ...current.categoryPlaces };
      for (const [category, id] of Object.entries(categoryPlaces)) {
        if (id === placeId) delete categoryPlaces[category as CategoryId];
      }
      return {
        ...current,
        savedPlaces: current.savedPlaces.filter((place) => place.id !== placeId),
        categoryPlaces,
      };
    });
  }, []);

  /* --- Activiteitstypes --------------------------------------------------- */

  // De namen van de ingebouwde types komen uit het woordenboek, dus ze horen
  // opnieuw berekend te worden zodra je van taal wisselt. Zonder `language`
  // hier bleef er "Werk" en "Koken" staan in de Engelse app.
  const categories = useMemo(
    () => allCategories(settings.customCategories),
    // De taal staat niet in de body maar bepaalt wel de uitkomst: `allCategories`
    // leest hem uit de module-brede taalstand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.customCategories, language],
  );

  const categoryFor = useCallback(
    (id: CategoryId) => resolveCategory(id, settings.customCategories),
    [settings.customCategories],
  );

  const addCustomCategory = useCallback(
    (input: { label: string; emoji: string; color: string }): CustomCategory => {
      const category: CustomCategory = { id: createId(), ...input };
      setSettings((current) => ({
        ...current,
        customCategories: [...current.customCategories, category],
      }));
      return category;
    },
    [],
  );

  const removeCustomCategory = useCallback((id: string) => {
    setSettings((current) => ({
      ...current,
      customCategories: current.customCategories.filter((c) => c.id !== id),
    }));
  }, []);

  const retryTravel = useCallback(
    (id: string) => {
      failedKeys.current.clear();
      const activity = activities.find((item) => item.id === id);
      if (activity) void computeTravel(activity, settings);
    },
    [activities, settings, computeTravel],
  );

  /* --- Schoolwerk: taken ------------------------------------------------ */

  const addTask = useCallback((task: Task) => {
    setTasks((current) => [...current, task]);
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task,
      ),
    );
  }, []);

  const removeTask = useCallback(
    (id: string) => {
      setTasks((current) => current.filter((task) => task.id !== id));
      recordDeletion(id);
    },
    [recordDeletion],
  );

  const setTaskStatus = useCallback((id: string, status: Task["status"]) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, status, updatedAt: new Date().toISOString() } : task,
      ),
    );
  }, []);

  const toggleTaskStep = useCallback((taskId: string, stepId: string) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId || !task.steps) return task;
        const steps: TaskStep[] = task.steps.map((step) =>
          step.id === stepId ? { ...step, done: !step.done } : step,
        );
        return { ...task, steps, updatedAt: new Date().toISOString() };
      }),
    );
  }, []);

  /* --- Schoolwerk: toetsen ---------------------------------------------- */

  const addExam = useCallback((exam: Exam) => {
    setExams((current) => [...current, exam]);
  }, []);

  const updateExam = useCallback((id: string, patch: Partial<Exam>) => {
    setExams((current) =>
      current.map((exam) =>
        exam.id === id ? { ...exam, ...patch, updatedAt: new Date().toISOString() } : exam,
      ),
    );
  }, []);

  const removeExam = useCallback(
    (id: string) => {
      setExams((current) => current.filter((exam) => exam.id !== id));
      recordDeletion(id);
    },
    [recordDeletion],
  );

  const setExamStatus = useCallback((id: string, status: Exam["status"]) => {
    setExams((current) =>
      current.map((exam) =>
        exam.id === id ? { ...exam, status, updatedAt: new Date().toISOString() } : exam,
      ),
    );
  }, []);

  /* --- Back-up & synchronisatie ----------------------------------------- */

  const exportData = useCallback(
    (): BackupFile => buildBackup(settings, activities, tasks, exams),
    [settings, activities, tasks, exams],
  );

  const importData = useCallback(
    (data: BackupFile, mode: ImportMode): ImportSummary => {
      // Nieuwe of gewijzigde bestemmingen moeten opnieuw doorgerekend kunnen
      // worden, dus eerdere mislukkingen wissen we.
      failedKeys.current.clear();

      // De telling gebeurt hier, buiten de state-updater. Een updater kan door
      // React (StrictMode) twee keer draaien; muteren daarin zou dubbeltellen.
      const summary: ImportSummary = {
        activities:
          mode === "replace"
            ? { added: data.activities.length, updated: 0 }
            : countUpsert(activities, data.activities),
        tasks:
          mode === "replace"
            ? { added: data.tasks.length, updated: 0 }
            : countUpsert(tasks, data.tasks),
        exams:
          mode === "replace"
            ? { added: data.exams.length, updated: 0 }
            : countUpsert(exams, data.exams),
        settingsReplaced: false,
        mode,
      };

      if (mode === "replace") {
        setActivities(data.activities);
        setTasks(data.tasks);
        setExams(data.exams);
      } else {
        setActivities((current) => upsertById(current, data.activities));
        setTasks((current) => upsertById(current, data.tasks));
        setExams((current) => upsertById(current, data.exams));
      }

      if (data.settings) {
        // Bij samenvoegen mag een importbestand bestaande instellingen niet met
        // null wissen (bv. je thuislocatie). Bij vervangen geldt het bestand.
        const incoming =
          mode === "replace" ? data.settings : dropNullish(data.settings);
        if (Object.keys(incoming).length > 0) {
          summary.settingsReplaced = true;
          setSettings((current) => ({ ...current, ...incoming }));
        }
      }

      return summary;
    },
    [activities, tasks, exams],
  );

  // Bij inloggen: haal de data van de gebruiker op. Bestaat er nog niets in de
  // cloud, dan zetten we de huidige lokale data erin (eerste keer migreren).
  useEffect(() => {
    if (!supabase || !user || !hydrated) {
      setSyncStatus("off");
      return;
    }

    let cancelled = false;
    setSyncStatus("syncing");
    setSyncError(null);
    applyingRemote.current = true;

    (async () => {
      try {
        const remote = await pullData(supabase, user.id);
        if (cancelled) return;

        // Van wie is wat hier lokaal staat? Uitloggen wist de agenda niet, dus
        // zonder deze controle werd de agenda van de vorige gebruiker — met
        // thuisadres en al — samengevoegd en naar dit account gepusht.
        const owner = loadOwner();
        const someoneElses = owner !== null && owner !== user.id;

        // Lokaal en cloud samenvoegen zodat data van beide apparaten samenkomt
        // en niets wordt overschreven. Tenzij het lokale spul van een ander
        // account is: dan is de cloud de waarheid en blijft de agenda van die
        // ander waar hij hoort, in zijn eigen account.
        const local = { settings, activities, tasks, exams, deletions };
        const merged = someoneElses
          ? (remote ?? { settings: null, activities: [], tasks: [], exams: [] })
          : remote
            ? mergePayload(local, remote)
            : local;

        setActivities(merged.activities);
        setTasks(merged.tasks);
        setExams(merged.exams);
        setDeletions(merged.deletions ?? []);
        if (someoneElses) {
          // Ook de instellingen horen bij die ander. Zonder deze regel bleef
          // zijn thuisadres staan onder het account van de nieuwe gebruiker.
          setSettings({ ...DEFAULT_SETTINGS, ...(merged.settings ?? {}) });
        } else if (merged.settings) {
          setSettings((current) => ({ ...current, ...merged.settings }));
        }

        // Schrijf het samengevoegde resultaat terug, zodat beide kanten gelijk zijn.
        await pushData(supabase, user.id, merged);
        if (cancelled) return;
        saveOwner(user.id);
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("idle");
      } catch (error) {
        if (cancelled) return;
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Synchroniseren is mislukt.");
      } finally {
        // Iets later vrijgeven zodat de state-update van hierboven de push-effect
        // niet meteen opnieuw triggert.
        setTimeout(() => {
          applyingRemote.current = false;
        }, 150);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Alleen opnieuw draaien wanneer de gebruiker wisselt of na hydratatie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user, hydrated]);

  // Terwijl je bent ingelogd: schrijf wijzigingen (debounced) naar de cloud.
  useEffect(() => {
    if (!supabase || !user || !hydrated || applyingRemote.current) return;

    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        await pushData(supabase, user.id, { settings, activities, tasks, exams, deletions });
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("idle");
        setSyncError(null);
      } catch (error) {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : say("error.cloudSave"));
      }
    }, 800);

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [supabase, user, hydrated, activities, tasks, exams, settings, deletions]);

  const value = useMemo<AgendaContextValue>(
    () => ({
      activities,
      settings,
      hydrated,
      calculatingIds,
      addActivity,
      replaceActivities,
      updateActivity,
      removeActivity,
      removeOccurrence,
      lastRemoved,
      undoRemove,
      forgetRemoved,
      updateSettings,
      rememberPlace,
      renamePlace,
      forgetPlace,
      categories,
      categoryFor,
      addCustomCategory,
      removeCustomCategory,
      retryTravel,
      tasks,
      exams,
      addTask,
      updateTask,
      removeTask,
      setTaskStatus,
      toggleTaskStep,
      addExam,
      updateExam,
      removeExam,
      setExamStatus,
      exportData,
      importData,
      sync: { status: syncStatus, error: syncError, lastSyncedAt },
    }),
    [
      activities,
      settings,
      hydrated,
      calculatingIds,
      addActivity,
      replaceActivities,
      updateActivity,
      removeActivity,
      removeOccurrence,
      lastRemoved,
      undoRemove,
      forgetRemoved,
      updateSettings,
      rememberPlace,
      renamePlace,
      forgetPlace,
      categories,
      categoryFor,
      addCustomCategory,
      removeCustomCategory,
      retryTravel,
      tasks,
      exams,
      addTask,
      updateTask,
      removeTask,
      setTaskStatus,
      toggleTaskStep,
      addExam,
      updateExam,
      removeExam,
      setExamStatus,
      exportData,
      importData,
      syncStatus,
      syncError,
      lastSyncedAt,
    ],
  );

  return <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>;
}

export function useAgenda(): AgendaContextValue {
  const context = useContext(AgendaContext);
  if (!context) throw new Error("useAgenda moet binnen een <AgendaProvider> gebruikt worden.");
  return context;
}
