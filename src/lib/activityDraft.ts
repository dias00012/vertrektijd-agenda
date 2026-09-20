import { placeForCategory } from "@/lib/places";
import { resolveCategory } from "@/lib/categories";
import { minutesToTime, todayKey } from "@/lib/time";
import type {
  Activity,
  ActivityDraft,
  ActivityOccurrence,
  CategoryId,
  Settings,
} from "@/lib/types";

/**
 * Waarmee het activiteitenformulier begint.
 *
 * Dit stond bovenin het formulier zelf, en dat bestand was 1144 regels. Het is
 * geen weergave maar een beslissing -- en een met drie gemelde fouten erin, die
 * je in het commentaar hieronder terugleest. Apart betekent: na te rekenen
 * zonder een browser op te starten.
 */

/** Een uur, als je niets anders opgeeft. */
export const DEFAULT_DURATION_MINUTES = 60;

/** De startdatum van de reeks; bij een losse activiteit zijn eigen datum. */
export function seriesStart(activity: Activity): string {
  const occurrence = activity as Partial<ActivityOccurrence>;
  return occurrence.seriesDate ?? activity.date;
}

export function initialDraft(
  settings: Settings,
  activity?: Activity,
  preset?: Partial<ActivityDraft>,
): ActivityDraft {
  if (activity) {
    return {
      category: activity.category,
      title: activity.title,
      // Bij een reeks de startdatum van de reeks, niet de dag die je toevallig
      // aanklikte. Opslaan schrijft dit veld terug als startdatum, dus met de
      // aangeklikte dag erin verdween alles wat daarvóór lag — ook als je
      // alleen de kleur veranderde.
      date: seriesStart(activity),
      // Zonder deze twee klopte het formulier bij bewerken toevallig nog wel
      // (updateActivity laat ontbrekende velden staan), maar dupliceren maakte
      // van een vakantie van vijf dagen stil één dag van 09:00 tot 10:00.
      allDay: activity.allDay ?? false,
      endDate: activity.endDate ?? null,
      startTime: activity.startTime,
      endTime: activity.endTime,
      location: activity.location,
      // Geen "standaard"-optie meer: toon meteen de kleur en het vervoermiddel
      // die nu gelden, zodat wat je ziet ook is wat er gebeurt.
      color:
        activity.color ??
        resolveCategory(activity.category, settings.customCategories, settings.categoryOverrides)
          .color,
      travelMode: activity.travelMode ?? settings.travelMode,
      // Anders dan kleur en vervoermiddel bewust wél met een "standaard"-stand:
      // een marge is een getal, en een ingevuld veld dat de algemene waarde
      // toont zou die bij het opslaan vastzetten op deze activiteit. Dan volgt
      // hij de instellingen niet meer als je die later verandert.
      bufferMinutes: activity.bufferMinutes ?? null,
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
    color: resolveCategory(category, settings.customCategories, settings.categoryOverrides).color,
    travelMode: settings.travelMode,
    bufferMinutes: null,
    recurrence: null,
    ...preset,
  };
}
