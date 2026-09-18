import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint-instellingen. Bewust de aanbevolen set van Next.js plus TypeScript:
 * die vangt de fouten die de compiler niet ziet, zoals ontbrekende
 * afhankelijkheden in een useEffect of een <img> waar <Image> hoort.
 *
 * Sinds ESLint 10 levert ESLint de `FlatCompat`-brug niet meer mee, en sinds
 * eslint-config-next 16 is die ook niet meer nodig: beide sets zijn zelf al
 * een flat config en worden hier rechtstreeks uitgeklapt. Dezelfde twee sets
 * als hiervoor, alleen zonder vertaallaag ertussen.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      /*
       * Next 16 brengt de regels van de React Compiler mee. Deze wijst
       * `setState` in een effect aan, en vond vijfentwintig plekken -- maar
       * geen ervan is een fout.
       *
       * Vierentwintig zijn dezelfde: deze app bewaart alles in localStorage,
       * en dat bestaat niet op de server. Lezen kan dus pas ná het mounten, in
       * precies zo'n effect, met `hydrated` als sein dat het gebeurd is. De
       * rest zijn foutpaden ("de opslag zit vol") die zelden aangaan.
       *
       * Het alternatief is de hele opstart verbouwen, en dat is geen regel
       * volgen maar een architectuur omgooien voor iets wat werkt. Uit dus,
       * met de reden erbij -- een regel die permanent staat te waarschuwen
       * leert mensen alleen om waarschuwingen te negeren.
       */
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      ".next-verify/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/sw.js",
    ],
  },
];

export default config;
