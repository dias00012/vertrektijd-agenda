"use client";

import dynamic from "next/dynamic";

/**
 * Het activiteitenformulier, pas opgehaald als je het opent.
 *
 * Het staat op vijf plekken: de kaart van een activiteit, de dagtijdlijn, het
 * weekrooster, de reisplanner en de schil om de app heen. Elk daarvan trok het
 * hele formulier -- het grootste onderdeel van de app -- mee in de code van dat
 * scherm. Eén plek waar het lui wordt geladen, zodat de vijf plekken die het
 * gebruiken er niet elk apart aan hoeven te denken.
 */
export const ActivityForm = dynamic(
  () => import("./ActivityForm").then((m) => ({ default: m.ActivityForm })),
  { ssr: false },
);
