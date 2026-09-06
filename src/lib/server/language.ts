import "server-only";
import type { Language } from "@/lib/i18n/locale";
import { translate, type TranslationKey, type Values } from "@/lib/i18n/dictionary";

/**
 * De taal van de gebruiker, meegestuurd door de app.
 *
 * De server kent de gekozen taal niet uit zichzelf: die staat in de browser.
 * De client zet hem daarom in een header, en anders valt hij terug op de
 * taalvoorkeur van de browser.
 */
export function requestLanguage(request: Request): Language {
  const explicit = request.headers.get("x-language")?.trim().toLowerCase();
  if (explicit === "en" || explicit === "nl") return explicit;

  const accept = request.headers.get("accept-language")?.toLowerCase() ?? "";
  // "en-GB,en;q=0.9,nl;q=0.8" — de eerste die we kennen wint.
  for (const part of accept.split(",")) {
    const base = part.trim().split(";")[0].split("-")[0];
    if (base === "nl") return "nl";
    if (base === "en") return "en";
  }
  return "nl";
}

/** Vertaalt een bericht in de taal van deze aanvraag. */
export function say(request: Request, key: TranslationKey, values?: Values): string {
  return translate(requestLanguage(request), key, values);
}
