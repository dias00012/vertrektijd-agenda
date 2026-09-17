"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/useLanguage";
import { useAgenda } from "@/hooks/useAgenda";
import { categoriesUsingPlace, placeDisplayName, placeEmoji, sortedPlaces, missesStreet } from "@/lib/places";
import { LocationInput } from "@/components/LocationInput";
import { AccountSection } from "@/components/AccountSection";
import { BackupSection } from "@/components/BackupSection";
import { ConnectorSection } from "@/components/ConnectorSection";
import { RemindersSection } from "@/components/RemindersSection";
import { TimetableImport } from "@/components/TimetableImport";
import { CalendarSubscriptions } from "@/components/CalendarSubscriptions";
import { LanguageSection } from "@/components/LanguageSection";
import { ThemeSection } from "@/components/ThemeSection";
import { SettingsGroup, SettingsRow } from "@/components/SettingsRow";
import { useIntro } from "@/hooks/useIntro";
import { Spinner } from "@/components/ui";
import { travelModes } from "@/lib/travelModes";
import type { GeoLocation, TransitBike, TravelMode } from "@/lib/types";
import pkg from "../../../package.json";
import type { TranslationKey } from "@/lib/i18n/dictionary";

const MAX_BUFFER_MINUTES = 120;

/**
 * Instellingen: alles wat de app over jou en je reis weet.
 *
 * Vier groepen, en binnen een groep staat elk onderdeel dichtgeklapt met eronder
 * wat er nu is ingesteld. Alles tegelijk openzetten gaf een scherm waarin je elke
 * keer opnieuw moest zoeken waar die ene regel ook alweer stond, terwijl je
 * meestal alleen even wilt zien wat er staat.
 */
export default function SettingsPage() {
  const t = useT();

  return (
    <div>
      <header className="mb-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("settings.subtitle")}
        </p>
      </header>

      <SettingsGroup title={t("settings.group.travel")}>
        <TravelSection />
        <SavedPlaces />
        <RemindersSection />
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.agenda")}>
        <TimetableImport />
        <CalendarSubscriptions />
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.look")}>
        <LanguageSection />
        <ThemeSection />
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.account")}>
        <AccountSection />
        <ConnectorSection />
        <BackupSection />
        <IntroSection />
      </SettingsGroup>

      <p className="mt-6 px-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        <span className="font-semibold">{t("settings.aboutTitle")}</span> &middot;{" "}
        {t("settings.aboutBody")}
      </p>

      {/*
        Welke versie dit apparaat draait. Klein, maar het beantwoordt de vraag
        die je anders niet kúnt beantwoorden: draaien mijn telefoon en mijn
        laptop wel dezelfde app? Zonder dit is "het werkt bij mij niet" niet te
        onderscheiden van "dit apparaat heeft de nieuwe versie nog niet".
      */}
      <p className="mt-2 px-1 text-xs tabular-nums" style={{ color: "var(--muted)" }}>
        {t("settings.version", { version: pkg.version })}
      </p>
    </div>
  );
}

/** Thuislocatie, marge en waarmee je standaard reist: samen je vertrektijd. */
function TravelSection() {
  const { settings, hydrated, updateSettings, activities } = useAgenda();
  const t = useT();
  const [home, setHome] = useState<GeoLocation | null>(null);
  const [buffer, setBuffer] = useState("10");
  const [mode, setMode] = useState<TravelMode>("car");
  const [bike, setBike] = useState<TransitBike>("none");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    setHome(settings.home);
    setBuffer(String(settings.bufferMinutes));
    setMode(settings.travelMode);
    setBike(settings.transitBike ?? "none");
  }, [
    hydrated,
    settings.home,
    settings.bufferMinutes,
    settings.travelMode,
    settings.transitBike,
  ]);

  const activitiesWithLocation = activities.filter((activity) => activity.location).length;
  /* Zonder thuisadres rekent de app geen enkele vertrektijd uit. Dat hoort te
     zien te zijn zonder dat je ergens op klikt, dus rood en meteen open. */
  const missingHome = hydrated && !settings.home;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);

    if (!home) {
      setError(t("settings.needSuggestion"));
      return;
    }
    const parsed = Number(buffer);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_BUFFER_MINUTES) {
      setError(t("settings.bufferRange", { max: MAX_BUFFER_MINUTES }));
      return;
    }

    setError(null);
    // Wijzigt de thuislocatie? Dan herberekent de store alle reistijden zelf.
    updateSettings({
      home,
      bufferMinutes: Math.round(parsed),
      travelMode: mode,
      transitBike: bike,
    });
    setSaved(true);
  }

  return (
    <SettingsRow
      icon={"\u{1F3E0}"}
      title={t("settings.row.travel")}
      attention={missingHome}
      openWhen={missingHome}
      summary={
        !hydrated
          ? undefined
          : settings.home
            ? `${settings.home.label} · ${t("settings.summary.buffer", {
                count: settings.bufferMinutes,
              })}`
            : t("settings.summary.noHome")
      }
    >
      {!hydrated ? (
        <div className="py-4 text-center">
          <Spinner size={18} label={t("settings.loading")} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <LocationInput
            label={t("settings.homeLabel")}
            value={home}
            onChange={(value) => {
              setHome(value);
              setSaved(false);
            }}
            required
            placeholder={t("settings.homePlaceholder")}
            hint={t("settings.homeHint")}
          />

          <div>
            <label className="label" htmlFor="buffer">
              {t("settings.buffer")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="buffer"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_BUFFER_MINUTES}
                className="field w-28"
                value={buffer}
                onChange={(event) => {
                  setBuffer(event.target.value);
                  setSaved(false);
                }}
              />
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                {t("settings.bufferUnit")}
              </span>
            </div>
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {t("settings.formula")}
            </p>
          </div>

          <fieldset>
            <legend className="label">{t("settings.defaultMode")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {travelModes().map((item) => {
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    title={item.hint}
                    onClick={() => {
                      setMode(item.id);
                      setSaved(false);
                    }}
                    className="flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active
                        ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--muted)",
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
              {t("settings.modeHint")}
            </p>
          </fieldset>

          <fieldset>
            <legend className="label">&#128690; {t("settings.bike.title")}</legend>
            <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {t("settings.bike.body")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(["none", "start", "both"] as const).map((option) => {
                const active = bike === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    title={t(`settings.bike.${option}Hint` as TranslationKey)}
                    onClick={() => {
                      setBike(option);
                      setSaved(false);
                    }}
                    className="rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition-colors"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active
                        ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    <span aria-hidden className="block text-base leading-none">
                      {option === "none" ? "\u{1F6B6}" : "\u{1F6B2}"}
                    </span>
                    {t(`settings.bike.${option}` as TranslationKey)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {t(`settings.bike.${bike}Hint` as TranslationKey)}
            </p>
          </fieldset>

          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
              &#9888;&#65039; {error}
            </p>
          ) : null}

          {saved ? (
            <p className="text-sm" style={{ color: "var(--accent)" }} role="status">
              &#10003; {t("settings.saved")}
              {activitiesWithLocation > 0
                ? ` ${
                    activitiesWithLocation === 1
                      ? t("settings.recalcOne")
                      : t("settings.recalc", { count: activitiesWithLocation })
                  }`
                : ""}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary w-full sm:w-auto">
            {t("common.save")}
          </button>
        </form>
      )}
    </SettingsRow>
  );
}

/**
 * De kennismaking opnieuw bekijken. Je krijgt hem één keer bij de eerste keer
 * openen, en dan nooit meer — terwijl je juist dán nog niet weet wat de app kan.
 */
function IntroSection() {
  const intro = useIntro();
  const t = useT();
  if (!intro) return null;

  return (
    <SettingsRow
      icon={"\u{1F44B}"}
      title={t("settings.intro.title")}
      summary={t("settings.intro.summary")}
    >
      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("settings.intro.body")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={intro.openTour}>
          &#128506;&#65039; {t("settings.intro.startTour")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={intro.open}>
          {t("settings.intro.again")}
        </button>
      </div>
    </SettingsRow>
  );
}

/** Overzicht van bewaarde locaties, met de categorieën die ze als vaste plek gebruiken. */
function SavedPlaces() {
  const { settings, forgetPlace, renamePlace, movePlace, categoryFor, hydrated } = useAgenda();
  const t = useT();
  const places = sortedPlaces(settings);
  /** De locatie waarvan je op dit moment de naam aanpast. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  /** De locatie waarvan je op dit moment het adres opnieuw kiest. */
  const [readdressing, setReaddressing] = useState<string | null>(null);

  return (
    <SettingsRow
      icon={"\u{1F4CD}"}
      title={t("places.title")}
      summary={
        !hydrated
          ? undefined
          : places.length === 0
            ? t("places.none")
            : places.length === 1
              ? t("places.countOne")
              : t("places.count", { count: places.length })
      }
    >
      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("places.body")}
      </p>

      {places.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {t("places.empty")}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {places.map((place) => {
            const categories = categoriesUsingPlace(settings, place.id);
            return (
              <li
                key={place.id}
                className="flex items-start gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="min-w-0 flex-1">
                  {renaming === place.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        renamePlace(place.id, draftName);
                        setRenaming(null);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        className="field py-1.5 text-sm"
                        value={draftName}
                        autoFocus
                        placeholder={t("places.namePlaceholder")}
                        aria-label={t("places.nameLabel")}
                        onChange={(event) => setDraftName(event.target.value)}
                      />
                      <button type="submit" className="btn btn-primary shrink-0 px-3 py-1.5 text-xs">
                        {t("common.save")}
                      </button>
                    </form>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span aria-hidden>{placeEmoji(place, settings)}</span>
                      <span className="truncate">{placeDisplayName(place, settings)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftName(place.customName ?? "");
                          setRenaming(place.id);
                        }}
                        aria-label={t("places.rename")}
                        className="shrink-0 text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        &#9998;
                      </button>
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
                    {place.location.label}
                  </p>
                  {/* Zonder straatnaam is het geen adres maar een los punt dat
                      honderden meters verkeerd kan liggen. Dan klopt elke
                      reistijd naar deze plek niet, en dat zie je nergens aan. */}
                  {missesStreet(place.location) ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                      &#9888;&#65039; {t("place.noStreet")}
                      <span className="mt-0.5 block" style={{ color: "var(--muted)" }}>
                        {t("places.noStreet.fix")}
                      </span>
                    </p>
                  ) : null}
                  {categories.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {categories.map((id) => {
                        const category = categoryFor(id);
                        return (
                          <span
                            key={id}
                            className="rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
                            style={{
                              background: `color-mix(in srgb, ${category.color} 15%, transparent)`,
                              color: category.color,
                            }}
                          >
                            {category.emoji}{" "}
                            {t("places.fixedFor", { category: category.label })}
                          </span>
                        );
                      })}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {t("places.quickOnly")}
                    </p>
                  )}
                  {readdressing === place.id ? (
                    <div className="mt-2">
                      <LocationInput
                        value={null}
                        label={t("places.newAddress")}
                        placeholder={t("places.newAddress.placeholder")}
                        hint={t("places.newAddress.hint")}
                        onChange={(location) => {
                          if (!location) return;
                          movePlace(place.id, location);
                          setReaddressing(null);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost mt-2 px-3 py-1.5 text-xs"
                        onClick={() => setReaddressing(null)}
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mt-1 text-xs underline"
                      style={{ color: "var(--muted)" }}
                      onClick={() => setReaddressing(place.id)}
                    >
                      {t("places.changeAddress")}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => forgetPlace(place.id)}
                  aria-label={t("places.remove", { name: placeDisplayName(place, settings) })}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm"
                  style={{ color: "var(--danger)" }}
                >
                  &#10005;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsRow>
  );
}
