"use client";

import { useEffect, useState } from "react";
import { fetchTravel } from "@/lib/api";
import { useNow } from "@/hooks/useNow";
import { REFRESH_MS, refreshDecision, travelModeFor, travelPlanForDate } from "@/lib/travel";
import type { ActivityOccurrence, Settings, TravelInfo, TravelResult } from "@/lib/types";

/**
 * Reis van één dag uit een herhalende activiteit.
 *
 * De agenda bewaart per activiteit één reis: die van de eerstvolgende keer.
 * Voor een reeks ("elke werkdag naar school") klopt dat op maandag wel en op
 * donderdag niet, want dan rijdt er een andere trein. Deze hook haalt daarom
 * voor OV-activiteiten de rit van de dag zelf op.
 *
 * Auto en fiets hangen niet van een dienstregeling af; daar blijft de reis van
 * de activiteit gewoon staan en gebeurt er hier niets.
 */

interface OccurrenceTravel {
  travel: TravelInfo | null;
  returnTravel: TravelInfo | null;
  loading: boolean;
  /** true wanneer deze tijden echt van deze dag zijn (en niet van een andere). */
  exact: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
/** Bij een verversing hergebruiken we alleen een heel verse uitkomst. */
const FRESH_MS = 20 * 1000;

interface CacheEntry {
  at: number;
  value: Promise<{ outbound: TravelResult; inbound: TravelResult }>;
}

/**
 * Reizen van deze sessie, per activiteit + dag. Voorkomt dat één weekoverzicht
 * dezelfde rit tien keer opvraagt bij de (gratis) OV-dienst.
 */
const cache = new Map<string, CacheEntry>();

export function useOccurrenceTravel(
  activity: ActivityOccurrence,
  settings: Settings,
): OccurrenceTravel {
  const stored = { travel: activity.travel ?? null, returnTravel: activity.returnTravel ?? null };

  // Midden op een schooldag valt er niets te reizen: je bent er al. Zonder
  // deze regel vraagt elk lesuur zijn eigen rit op bij de OV-planner.
  const travels = activity.travelRole.outbound || activity.travelRole.inbound;
  const isTransit = travels && travelModeFor(activity, settings) === "transit";
  const plan = isTransit ? travelPlanForDate(activity, settings, activity.date) : null;

  // Staat de rit van deze dag al in de activiteit zelf, dan is er niets te
  // doen. Heen én terug: de heensleutel gaat over de starttijd, de terugsleutel
  // over de eindtijd. Alleen op de heensleutel kijken betekende dat een
  // gewijzigde eindtijd niets opnieuw ophaalde, en de oude thuiskomsttijd als
  // exact bleef staan.
  const alreadyExact = Boolean(
    plan &&
      activity.travel?.key === plan.outboundKey &&
      activity.returnTravel?.key === plan.returnKey,
  );
  const [fetched, setFetched] = useState<{
    key: string;
    travel: TravelInfo;
    returnTravel: TravelInfo;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  /** Verandert zodra we opnieuw willen ophalen, bv. na een paar minuten. */
  const [reloadAt, setReloadAt] = useState(0);

  // Eén sleutel voor het hele paar: verandert er aan heen óf terug iets, dan
  // moet er opnieuw opgehaald worden.
  const tripKey = plan ? `${plan.outboundKey}|${plan.returnKey}` : null;

  /*
   * Eén klok voor deze hele hook.
   *
   * Hier werd de echte tijd drie keer los afgelezen: voor `offset`, voor
   * `nowMs` en via de standaardwaarde van `tripHasLeft`. Dat is onzuiver
   * tijdens het renderen -- twee renders geven een andere uitkomst -- en het
   * kon ook echt uiteenlopen: viel er een dag- of vertrekgrens tussen twee van
   * die aflezingen, dan rekende dezelfde render met twee verschillende "nu".
   *
   * `useNow` is de klok die het dashboard en de agenda al gebruiken: hij staat
   * in state en tikt, dus renderen is nu een som van wat erin gaat. Dat het
   * antwoord meeverandert met de tijd blijft de bedoeling -- dat komt nu van
   * een tik, en niet van een render die toevallig langskomt. Dat is meteen
   * betrouwbaarder: het verversvenster ging vroeger pas open zodra er om een
   * andere reden gerenderd werd.
   */
  const now = useNow();
  const { worthRefreshing, shouldFetch } = refreshDecision(
    {
      date: activity.date,
      startTime: activity.startTime,
      endTime: activity.endTime,
      plan,
      alreadyExact,
      // Wat we nú tonen: het verse antwoord als dat bij deze rit hoort, anders
      // wat er in de activiteit staat.
      shownAt: fetched?.key === tripKey ? fetched.travel.computedAt : activity.travel?.computedAt,
    },
    now,
  );

  useEffect(() => {
    if (!isTransit || !worthRefreshing) return;

    const refresh = () => setReloadAt(Date.now());
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isTransit, worthRefreshing]);

  useEffect(() => {
    if (!shouldFetch || !plan || !tripKey || !settings.home || !activity.location) return;
    if (fetched?.key === tripKey && reloadAt === 0) return;

    const home = settings.home;
    const destination = activity.location;
    let active = true;

    // Bij een verversing accepteren we alleen een heel verse uitkomst. Zo delen
    // twee kaarten van dezelfde activiteit (dashboard en dagoverzicht) één
    // aanvraag in plaats van er allebei een te doen.
    const maxAge = reloadAt > 0 ? FRESH_MS : CACHE_TTL_MS;
    const cached = cache.get(tripKey);
    const entry =
      cached && Date.now() - cached.at < maxAge
        ? cached
        : (() => {
            const value = Promise.all([
              fetchTravel(home, destination, {
                mode: plan.mode,
                arriveBy: plan.arriveBy,
                bike: plan.outboundBike,
              }),
              fetchTravel(destination, home, {
                mode: plan.mode,
                departAt: plan.departAt,
                bike: plan.returnBike,
              }),
            ]).then(([outbound, inbound]) => ({ outbound, inbound }));
            const fresh = { at: Date.now(), value };
            cache.set(tripKey, fresh);
            // Een mislukte reis niet vasthouden: morgen mag het opnieuw.
            value.catch(() => cache.delete(tripKey));
            return fresh;
          })();

    setLoading(true);
    entry.value
      .then(({ outbound, inbound }) => {
        if (!active) return;
        // Het moment van ophalen, niet van binnenkomen: komt dit uit de cache
        // van deze sessie, dan is het antwoord zo oud als die cache. Anders zou
        // een hergebruikte uitkomst zich als vers voordoen en het verversen
        // telkens opnieuw uitstellen.
        const computedAt = new Date(entry.at).toISOString();
        setFetched({
          key: tripKey,
          travel: { ...outbound, computedAt, key: plan.outboundKey },
          returnTravel: { ...inbound, computedAt, key: plan.returnKey },
        });
      })
      .catch(() => {
        // Lukt het niet, dan blijft de reis van de activiteit staan: liever een
        // benadering dan een lege kaart.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetch, tripKey, reloadAt]);

  if (!isTransit) return { ...stored, loading: false, exact: true };

  // Een verse uitkomst wint van wat er in de activiteit staat, ook als dat
  // dezelfde rit is: die van hiernaast kent de vertraging van dit moment.
  if (fetched && fetched.key === tripKey) {
    return {
      travel: fetched.travel,
      returnTravel: fetched.returnTravel,
      loading: false,
      exact: true,
    };
  }

  // Nog niets nieuws binnen: laat zien wat er staat. Dat is de goede rit, en
  // wachten op een verversing met een leeg scherm helpt niemand.
  if (alreadyExact) return { ...stored, loading: false, exact: true };

  return { ...stored, loading: loading && shouldFetch, exact: false };
}
