"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { detectLanguage, setLanguage as setActive, LANGUAGE_KEY, type Language } from "@/lib/i18n/locale";
import { translate, type TranslationKey, type Values } from "@/lib/i18n/dictionary";

interface LanguageValue {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Vertaalt een sleutel; `values` vult plekken als {count} in. */
  t: (key: TranslationKey, values?: Values) => string;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setState] = useState<Language>("nl");

  // Pas na het aankoppelen: op de server is er geen opgeslagen keuze, en de
  // eerste weergave moet aan beide kanten gelijk zijn.
  useEffect(() => {
    const detected = detectLanguage();
    setActive(detected);
    setState(detected);
    document.documentElement.lang = detected;
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setActive(next);
    setState(next);
    document.documentElement.lang = next;
    try {
      window.localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // Privémodus: de keuze geldt dan alleen voor deze sessie.
    }
  }, []);

  const value = useMemo<LanguageValue>(
    () => ({
      language,
      setLanguage,
      t: (key, values) => translate(language, key, values),
    }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage moet binnen een <LanguageProvider> gebruikt worden.");
  }
  return context;
}

/** Korte vorm voor componenten die alleen willen vertalen. */
export function useT(): (key: TranslationKey, values?: Values) => string {
  return useLanguage().t;
}
