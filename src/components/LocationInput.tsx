"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchLocations } from "@/lib/api";
import { Spinner } from "./ui";
import type { GeocodeResult, GeoLocation, SavedPlace } from "@/lib/types";

interface Props {
  value: GeoLocation | null;
  onChange: (value: GeoLocation | null) => void;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  error?: string | null;
  /** Bewaarde locaties als snelkeuze, zodat je niet opnieuw hoeft te zoeken. */
  places?: SavedPlace[];
}

const DEBOUNCE_MS = 400;

/**
 * Vrij typen van een adres, plaatsnaam of locatie met suggesties uit
 * /api/geocode. Pas als er een suggestie gekozen is hebben we coordinaten en
 * kan de reistijd berekend worden.
 */
export function LocationInput({
  value,
  onChange,
  label,
  placeholder = "Bijv. Windesheim Almere",
  hint,
  required,
  error,
  places = [],
}: Props) {
  const listId = useId();
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Zolang er niets gekozen is na het typen, is de invoer nog niet bruikbaar.
  const dirty = useRef(false);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    if (!dirty.current) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const found = await searchLocations(trimmed, controller.signal);
        setResults(found);
        setOpen(true);
        if (found.length === 0) setSearchError("Geen locatie gevonden. Probeer het anders te typen.");
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchError(err instanceof Error ? err.message : "Zoeken is mislukt.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(result: GeocodeResult) {
    dirty.current = false;
    onChange({ label: result.label, lat: result.lat, lon: result.lon });
    setQuery(result.label);
    setOpen(false);
    setResults([]);
    setSearchError(null);
  }

  function clear() {
    dirty.current = false;
    onChange(null);
    setQuery("");
    setResults([]);
    setSearchError(null);
  }

  const showError = error ?? searchError;

  return (
    <div ref={containerRef} className="relative">
      <label className="label" htmlFor={listId}>
        {label}
        {!required ? (
          <span style={{ fontWeight: 400 }}> · optioneel</span>
        ) : null}
      </label>

      <div className="relative">
        <input
          id={listId}
          type="text"
          className="field pr-10"
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          aria-invalid={showError ? "true" : undefined}
          aria-describedby={showError ? `${listId}-error` : undefined}
          onChange={(event) => {
            dirty.current = true;
            setQuery(event.target.value);
            if (value) onChange(null);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
        />

        <span className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }}>
          {loading ? (
            <Spinner size={14} />
          ) : value ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Locatie wissen"
              className="text-sm leading-none"
            >
              ✕
            </button>
          ) : (
            <span aria-hidden className="text-sm">
              🔍
            </span>
          )}
        </span>
      </div>

      {!value && places.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {places.slice(0, 6).map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => {
                dirty.current = false;
                onChange(place.location);
                setQuery(place.location.label);
                setResults([]);
                setOpen(false);
                setSearchError(null);
              }}
              className="max-w-full truncate rounded-full border px-2.5 py-1 text-xs transition-colors"
              style={{ borderColor: "var(--line)", color: "var(--muted)" }}
            >
              &#128205; {place.name}
            </button>
          ))}
        </div>
      ) : null}

      {value ? (
        <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
          📍 {value.label}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}

      {showError ? (
        <p id={`${listId}-error`} className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
          {showError}
        </p>
      ) : null}

      {open && results.length > 0 ? (
        <ul
          className="card animate-fade-in absolute z-20 mt-2 max-h-64 w-full overflow-auto p-1"
          role="listbox"
          aria-label="Locatiesuggesties"
        >
          {results.map((result) => (
            <li key={`${result.lat},${result.lon},${result.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => select(result)}
                className="w-full rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-soft)]"
              >
                <span className="block font-medium">{result.name}</span>
                {result.context ? (
                  <span className="block text-xs" style={{ color: "var(--muted)" }}>
                    {result.context}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
