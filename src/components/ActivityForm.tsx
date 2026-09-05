"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ACTIVITY_COLORS, activityColor, resolveCategory } from "@/lib/categories";
import { useAgenda } from "@/hooks/useAgenda";
import { minutesToTime, timeToMinutes, todayKey } from "@/lib/time";
import { WEEKDAYS, defaultRecurrence, sortWeekdays } from "@/lib/recurrence";
import { placeChoices, placeForCategory } from "@/lib/places";
import { TRAVEL_MODES, travelModeMeta } from "@/lib/travelModes";
import { LocationInput } from "./LocationInput";
import type {
  Activity,
  ActivityDraft,
  CategoryId,
  GeoLocation,
  Recurrence,
  Settings,
} from "@/lib/types";

interface Props {
  /** Meegeven om te bewerken; weglaten om een nieuwe activiteit te maken. */
  activity?: Activity;
  /**
   * De dag die de gebruiker aanklikte. Bij een herhalende reeks bepaalt dit
   * welke dag "alleen deze dag verwijderen" overslaat.
   */
  occurrenceDate?: string;
  /**
   * Alvast ingevulde velden voor een nieuwe activiteit, bijvoorbeeld wanneer je
   * vanuit een opdracht leertijd inplant. Wordt genegeerd bij bewerken.
   */
  preset?: Partial<ActivityDraft>;
  /** Koppelt de nieuwe activiteit aan een opdracht of toets. */
  link?: { taskId?: string; examId?: string };
  onClose: () => void;
}

interface FormErrors {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  recurrence?: string;
}

const DEFAULT_DURATION_MINUTES = 60;

function initialDraft(
  settings: Settings,
  activity?: Activity,
  preset?: Partial<ActivityDraft>,
): ActivityDraft {
  if (activity) {
    return {
      category: activity.category,
      title: activity.title,
      date: activity.date,
      startTime: activity.startTime,
      endTime: activity.endTime,
      location: activity.location,
      // Geen "standaard"-optie meer: toon meteen de kleur en het vervoermiddel
      // die nu gelden, zodat wat je ziet ook is wat er gebeurt.
      color: activity.color ?? resolveCategory(activity.category, settings.customCategories).color,
      travelMode: activity.travelMode ?? settings.travelMode,
      recurrence: activity.recurrence,
    };
  }
  const now = new Date();
  // Rond af op het volgende kwartier: prettiger startpunt dan 14:07.
  const start = Math.ceil((now.getHours() * 60 + now.getMinutes() + 5) / 15) * 15;
  const category: CategoryId = preset?.category ?? "school";
  return {
    category,
    title: "",
    date: todayKey(now),
    startTime: minutesToTime(start),
    endTime: minutesToTime(start + DEFAULT_DURATION_MINUTES),
    location: placeForCategory(settings, category)?.location ?? null,
    color: resolveCategory(category, settings.customCategories).color,
    travelMode: settings.travelMode,
    recurrence: null,
    ...preset,
  };
}

/** Modale sheet voor het toevoegen en bewerken van een activiteit. */
export function ActivityForm({ activity, occurrenceDate, preset, link, onClose }: Props) {
  const {
    addActivity,
    updateActivity,
    removeActivity,
    removeOccurrence,
    rememberPlace,
    settings,
    categories,
    categoryFor,
    addCustomCategory,
  } = useAgenda();
  const [draft, setDraft] = useState<ActivityDraft>(() =>
    initialDraft(settings, activity, preset),
  );
  const [submitted, setSubmitted] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"idle" | "choose" | "confirm">("idle");

  // Eigen activiteitstype maken (naam + emoji van je eigen toetsenbord).
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [newTypeEmoji, setNewTypeEmoji] = useState("");
  const [newTypeColor, setNewTypeColor] = useState(ACTIVITY_COLORS[0].value);
  const [typeError, setTypeError] = useState<string | null>(null);
  /** Heeft de gebruiker de kleur zelf gekozen? Zo niet, dan volgt hij het type. */
  const colorTouched = useRef(Boolean(activity?.color));
  // Nieuwe activiteiten onthouden hun locatie standaard; bij het bewerken van
  // een bestaande activiteit veranderen we de vaste locatie niet ongevraagd.
  const [remember, setRemember] = useState(!activity);
  /**
   * Is de huidige locatie door de app ingevuld (en dus vervangbaar bij het
   * wisselen van categorie) of door de gebruiker zelf gekozen?
   */
  const autoFilled = useRef(!activity && Boolean(placeForCategory(settings, "school")));

  const savedPlaces = placeChoices(settings);
  const categoryPlace = placeForCategory(settings, draft.category);
  // Al bekend als vaste plek voor deze categorie? Dan valt er niets te onthouden.
  const alreadyDefault =
    !!draft.location &&
    !!categoryPlace &&
    categoryPlace.location.lat === draft.location.lat &&
    categoryPlace.location.lon === draft.location.lon;

  const category = categoryFor(draft.category);
  const accent = activityColor(draft, category);
  const isEdit = Boolean(activity);
  const repeats = draft.recurrence !== null;
  // Alleen zinvol als de opgeslagen activiteit al een reeks is.
  const editingSeries = Boolean(activity?.recurrence);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const errors = useMemo<FormErrors>(() => {
    const next: FormErrors = {};
    if (!draft.title.trim()) next.title = "Geef de activiteit een naam.";
    if (!draft.date) next.date = "Kies een datum.";
    if (!draft.startTime) next.startTime = "Kies een starttijd.";
    if (!draft.endTime) next.endTime = "Kies een eindtijd.";
    if (
      draft.startTime &&
      draft.endTime &&
      timeToMinutes(draft.endTime) <= timeToMinutes(draft.startTime)
    ) {
      next.endTime = "De eindtijd moet na de starttijd liggen.";
    }
    if (draft.recurrence) {
      if (draft.recurrence.weekdays.length === 0) {
        next.recurrence = "Kies minstens één dag van de week.";
      } else if (draft.recurrence.until && draft.recurrence.until < draft.date) {
        next.recurrence = "De einddatum ligt voor de startdatum.";
      }
    }
    return next;
  }, [draft]);

  function patch(update: Partial<ActivityDraft>) {
    setDraft((current) => {
      const next = { ...current, ...update };
      // Schuif de eindtijd mee als die anders voor de starttijd zou vallen.
      if (update.startTime && timeToMinutes(next.endTime) <= timeToMinutes(update.startTime)) {
        next.endTime = minutesToTime(timeToMinutes(update.startTime) + DEFAULT_DURATION_MINUTES);
      }
      return next;
    });
  }

  /**
   * Bij het kiezen van een categorie vullen we de vaste locatie van die
   * categorie in — maar nooit over een locatie heen die je zelf al koos.
   */
  function selectCategory(categoryId: CategoryId) {
    const place = placeForCategory(settings, categoryId);
    // Koos je de kleur niet zelf, dan volgt hij het type — dat voelt logisch.
    const color = colorTouched.current
      ? draft.color
      : resolveCategory(categoryId, settings.customCategories).color;

    // Een locatie die je zelf koos blijft staan; een automatisch ingevulde
    // wisselt mee naar de vaste locatie van de nieuwe categorie.
    if (draft.location && !autoFilled.current) {
      patch({ category: categoryId, color });
      return;
    }
    autoFilled.current = Boolean(place);
    patch({ category: categoryId, color, location: place?.location ?? null });
  }

  /** Maakt een eigen type aan en selecteert het meteen. */
  function createType() {
    const label = newTypeLabel.trim();
    const emoji = newTypeEmoji.trim();
    if (!label) {
      setTypeError("Geef je type een naam.");
      return;
    }
    if (!emoji) {
      setTypeError("Kies een emoji als icoon.");
      return;
    }

    const created = addCustomCategory({ label, emoji, color: newTypeColor });
    colorTouched.current = false;
    patch({ category: created.id, color: created.color });

    setCreatingType(false);
    setNewTypeLabel("");
    setNewTypeEmoji("");
    setTypeError(null);
  }

  function patchRecurrence(update: Partial<Recurrence>) {
    setDraft((current) =>
      current.recurrence ? { ...current, recurrence: { ...current.recurrence, ...update } } : current,
    );
  }

  function toggleWeekday(value: number) {
    if (!draft.recurrence) return;
    const active = draft.recurrence.weekdays.includes(value);
    patchRecurrence({
      weekdays: sortWeekdays(
        active
          ? draft.recurrence.weekdays.filter((day) => day !== value)
          : [...draft.recurrence.weekdays, value],
      ),
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    const payload: ActivityDraft = { ...draft, title: draft.title.trim() };
    if (payload.location && remember && !alreadyDefault) {
      rememberPlace(payload.location, payload.category);
    }
    if (activity) updateActivity(activity.id, payload);
    else addActivity(payload);
    onClose();
  }

  function deleteSeries() {
    if (!activity) return;
    removeActivity(activity.id);
    onClose();
  }

  function deleteThisDay() {
    if (!activity || !occurrenceDate) return;
    removeOccurrence(activity.id, occurrenceDate);
    onClose();
  }

  const shown: FormErrors = submitted ? errors : {};

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(9, 12, 18, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Activiteit bewerken" : "Activiteit toevoegen"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="animate-sheet-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border sm:rounded-3xl"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="text-base font-semibold">
            {isEdit ? "Activiteit bewerken" : "Activiteit toevoegen"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="rounded-lg px-2 py-1 text-lg leading-none"
            style={{ color: "var(--muted)" }}
          >
            &#10005;
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {editingSeries ? (
            <p
              className="rounded-xl px-3 py-2 text-xs"
              style={{ background: "var(--surface-soft)", color: "var(--muted)" }}
            >
              &#128257; Dit is een herhalende activiteit. Wijzigingen gelden voor de hele reeks.
            </p>
          ) : null}

          <fieldset>
            <legend className="label">Type</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {categories.map((item) => {
                const active = item.id === draft.category;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectCategory(item.id)}
                    aria-pressed={active}
                    className="flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors"
                    style={{
                      borderColor: active ? item.color : "var(--line)",
                      background: active
                        ? `color-mix(in srgb, ${item.color} 12%, transparent)`
                        : "transparent",
                      color: active ? item.color : "var(--muted)",
                    }}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {item.emoji}
                    </span>
                    <span className="w-full truncate">{item.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCreatingType((open) => !open)}
                aria-expanded={creatingType}
                className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-2 py-2.5 text-xs font-medium transition-colors"
                style={{ borderColor: "var(--line)", color: "var(--muted)" }}
              >
                <span aria-hidden className="text-base leading-none">
                  ➕
                </span>
                Eigen
              </button>
            </div>

            {creatingType ? (
              <div
                className="mt-2 space-y-3 rounded-xl border px-3 py-3"
                style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}
              >
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Maak je eigen type. Kies een emoji met de emoji-toets van je toetsenbord
                  (Windows: <strong>Win + .</strong> · Mac: <strong>Ctrl + Cmd + spatie</strong>).
                </p>

                <div className="flex gap-2">
                  <div className="w-16 shrink-0">
                    <label className="label" htmlFor="new-type-emoji">
                      Icoon
                    </label>
                    <input
                      id="new-type-emoji"
                      className="field text-center text-lg"
                      value={newTypeEmoji}
                      onChange={(e) => setNewTypeEmoji(e.target.value.slice(0, 8))}
                      placeholder="🎸"
                      aria-label="Emoji voor je eigen type"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="new-type-label">
                      Naam
                    </label>
                    <input
                      id="new-type-label"
                      className="field"
                      value={newTypeLabel}
                      onChange={(e) => setNewTypeLabel(e.target.value)}
                      placeholder="Bijv. Bijbaan"
                    />
                  </div>
                </div>

                <div>
                  <span className="label">Kleur</span>
                  <div className="flex flex-wrap gap-2">
                    {ACTIVITY_COLORS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setNewTypeColor(option.value)}
                        aria-label={option.label}
                        title={option.label}
                        className="h-6 w-6 rounded-full"
                        style={{
                          background: option.value,
                          boxShadow:
                            newTypeColor === option.value
                              ? `0 0 0 2px var(--surface-soft), 0 0 0 4px ${option.value}`
                              : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {typeError ? (
                  <p className="text-xs" style={{ color: "var(--danger)" }}>
                    {typeError}
                  </p>
                ) : null}

                <div className="flex gap-2">
                  <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={createType}>
                    Type toevoegen
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => setCreatingType(false)}
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            ) : null}
          </fieldset>

          <div>
            <label className="label" htmlFor="activity-title">
              Naam
            </label>
            <input
              id="activity-title"
              className="field"
              placeholder={category.placeholder}
              value={draft.title}
              aria-invalid={shown.title ? "true" : undefined}
              onChange={(event) => patch({ title: event.target.value })}
            />
            {shown.title ? (
              <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {shown.title}
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className="label">Kleur</legend>
            <div className="flex flex-wrap items-center gap-2">
              {ACTIVITY_COLORS.map((option) => {
                const active = draft.color === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      colorTouched.current = true;
                      patch({ color: option.value });
                    }}
                    aria-pressed={active}
                    aria-label={option.label}
                    title={option.label}
                    className="h-7 w-7 rounded-full transition-transform"
                    style={{
                      background: option.value,
                      // Ring om de gekozen kleur, in plaats van een randje dat
                      // in het donkere thema wegvalt.
                      boxShadow: active
                        ? `0 0 0 2px var(--surface), 0 0 0 4px ${option.value}`
                        : "none",
                    }}
                  />
                );
              })}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="activity-date">
              {repeats ? "Startdatum" : "Datum"}
            </label>
            <input
              id="activity-date"
              type="date"
              className="field"
              value={draft.date}
              aria-invalid={shown.date ? "true" : undefined}
              onChange={(event) => patch({ date: event.target.value })}
            />
            {shown.date ? (
              <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {shown.date}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="activity-start">
                Starttijd
              </label>
              <input
                id="activity-start"
                type="time"
                className="field"
                value={draft.startTime}
                aria-invalid={shown.startTime ? "true" : undefined}
                onChange={(event) => patch({ startTime: event.target.value })}
              />
              {shown.startTime ? (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {shown.startTime}
                </p>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="activity-end">
                Eindtijd
              </label>
              <input
                id="activity-end"
                type="time"
                className="field"
                value={draft.endTime}
                aria-invalid={shown.endTime ? "true" : undefined}
                onChange={(event) => patch({ endTime: event.target.value })}
              />
              {shown.endTime ? (
                <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  {shown.endTime}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset
            className="rounded-2xl border px-3.5 py-3"
            style={{ borderColor: "var(--line)" }}
          >
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm font-semibold">&#128257; Herhalen</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={repeats}
                onChange={(event) =>
                  patch({ recurrence: event.target.checked ? defaultRecurrence(draft.date) : null })
                }
              />
            </label>

            {repeats && draft.recurrence ? (
              <div className="mt-3 space-y-3">
                <div>
                  <span className="label">Op deze dagen</span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => {
                      const active = draft.recurrence!.weekdays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleWeekday(day.value)}
                          aria-pressed={active}
                          aria-label={day.long}
                          className="h-10 w-10 rounded-full border text-xs font-semibold uppercase transition-colors"
                          style={{
                            borderColor: active ? accent : "var(--line)",
                            background: active
                              ? `color-mix(in srgb, ${accent} 15%, transparent)`
                              : "transparent",
                            color: active ? accent : "var(--muted)",
                          }}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="activity-until">
                    Tot en met <span style={{ fontWeight: 400 }}>· optioneel</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="activity-until"
                      type="date"
                      className="field"
                      value={draft.recurrence.until ?? ""}
                      min={draft.date}
                      onChange={(event) => patchRecurrence({ until: event.target.value || null })}
                    />
                    {draft.recurrence.until ? (
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0 px-3 py-2 text-xs"
                        onClick={() => patchRecurrence({ until: null })}
                      >
                        Wissen
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
                    Laat leeg om te blijven herhalen.
                  </p>
                </div>

                {shown.recurrence ? (
                  <p className="text-xs" style={{ color: "var(--danger)" }}>
                    {shown.recurrence}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <div>
            <LocationInput
              label="Locatie"
              value={draft.location}
              onChange={(location: GeoLocation | null) => {
                autoFilled.current = false;
                patch({ location });
              }}
              required={false}
              places={savedPlaces}
              hint={
                settings.home
                  ? "Laat leeg voor activiteiten thuis. Dan toont de app geen reistijd."
                  : "Stel eerst je thuislocatie in om reistijden te kunnen berekenen."
              }
            />

            {draft.location && !alreadyDefault ? (
              <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span style={{ color: "var(--muted)" }}>
                  Onthouden als vaste locatie voor {category.emoji} {category.label}. Dan staat
                  hij de volgende keer meteen ingevuld.
                </span>
              </label>
            ) : alreadyDefault ? (
              <p className="mt-2.5 text-xs" style={{ color: "var(--muted)" }}>
                &#128278; Dit is je vaste locatie voor {category.emoji} {category.label}.
              </p>
            ) : null}
          </div>

          {draft.location ? (
            <fieldset>
              <legend className="label">Hoe reis je hierheen?</legend>
              <div className="grid grid-cols-3 gap-2">
                {TRAVEL_MODES.map((item) => {
                  const active = draft.travelMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => patch({ travelMode: item.id })}
                      aria-pressed={active}
                      title={item.hint}
                      className="flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[0.7rem] font-medium transition-colors"
                      style={{
                        borderColor: active ? accent : "var(--line)",
                        background: active
                          ? `color-mix(in srgb, ${accent} 12%, transparent)`
                          : "transparent",
                        color: active ? accent : "var(--muted)",
                      }}
                    >
                      <span aria-hidden className="text-base leading-none">
                        {item.emoji}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
                Bij OV zoekt de app een echte rit die je op tijd laat aankomen, inclusief
                overstappen en spoor.
              </p>
            </fieldset>
          ) : null}
        </div>

        <footer className="border-t px-5 py-4" style={{ borderColor: "var(--line)" }}>
          {deleteMode === "choose" && editingSeries ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Wat wil je verwijderen?</p>
              <div className="flex flex-wrap gap-2">
                {occurrenceDate ? (
                  <button type="button" className="btn btn-ghost" onClick={deleteThisDay}>
                    Alleen deze dag
                  </button>
                ) : null}
                <button type="button" className="btn btn-danger" onClick={deleteSeries}>
                  Hele reeks
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setDeleteMode("idle")}
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isEdit ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    if (editingSeries) setDeleteMode("choose");
                    else if (deleteMode === "confirm") deleteSeries();
                    else setDeleteMode("confirm");
                  }}
                >
                  {deleteMode === "confirm" ? "Zeker weten?" : "Verwijderen"}
                </button>
              ) : null}
              <div className="ml-auto flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Annuleren
                </button>
                <button type="submit" className="btn btn-primary">
                  {isEdit ? "Opslaan" : "Toevoegen"}
                </button>
              </div>
            </div>
          )}
        </footer>
      </form>
    </div>
  );
}
