# Vertrektijd — slimme agenda

Een persoonlijke agenda die niet alleen zegt _"je hebt om 09:00 school"_, maar vooral
_"je hebt om 09:00 school, je moet om 08:23 vertrekken."_

```
HOME_LOCATION → DESTINATION → ROUTING API → TRAVEL TIME
VERTREKTIJD  = STARTTIJD − REISTIJD − VEILIGHEIDSMARGE
THUISKOMST   = EINDTIJD  + REISTIJD TERUG
```

## Lokaal starten

```bash
npm install
```

```bash
npm run dev
```

Open daarna http://localhost:3000. De app werkt direct, zonder API-sleutel.

Stel bij het eerste gebruik je thuislocatie in via **Instellingen** — daarna berekent de
app voor elke activiteit met een locatie automatisch de reistijd en de vertrektijd.

## Technische keuzes

| Keuze | Waarom |
| --- | --- |
| **Next.js 15 (App Router) + TypeScript** | Eén project voor frontend én server. De API-routes draaien op de server, dus geocoding en routing gebeuren nooit vanuit de browser. |
| **Tailwind CSS v4** | Snel, klein en consistent. Categoriekleuren gaan via CSS-variabelen, zodat ze dynamisch kunnen zijn zonder gegenereerde klassen. |
| **Nominatim + OSRM (standaard)** | Gratis, open en **zonder API-sleutel** — de app werkt meteen na `npm install`. |
| **OpenRouteService (optioneel)** | Nauwkeuriger en met hogere limieten. Zet `TRAVEL_PROVIDER=ors` en `ORS_API_KEY=…` in `.env.local`; de key blijft server-side. |
| **localStorage** | Voor deze MVP is een database overbodig. De opslaglaag (`src/lib/storage.ts`) is bewust klein, zodat er later een echte backend achter kan. |

### Veilige API-aanroepen

De browser praat uitsluitend met `/api/geocode` en `/api/travel`. Providerkeuze, basis-URL's
en de eventuele API-sleutel staan in `.env.local` en worden alleen in `src/lib/server/*`
gelezen (met `import "server-only"` als extra slot op de deur). Er is geen enkele
`NEXT_PUBLIC_`-variabele, dus er kan geen sleutel in de client-bundle belanden.

Kopieer `.env.example` naar `.env.local` als je iets wilt aanpassen:

```bash
cp .env.example .env.local
```

## Bestanden

```
src/
├─ app/
│  ├─ layout.tsx                 App-frame + AgendaProvider
│  ├─ page.tsx                   Dashboard "Vandaag" (eerstvolgende + tijdlijn)
│  ├─ agenda/page.tsx            Agenda: Vandaag / Morgen / Week / Maand
│  ├─ schoolwerk/page.tsx        Opdrachten en toetsen met status en stappen
│  ├─ instellingen/page.tsx      Thuislocatie, locaties, weekplan, back-up
│  ├─ globals.css                Designsysteem (licht + donker)
│  └─ api/
│     ├─ geocode/route.ts        GET  /api/geocode?q=…
│     └─ travel/route.ts         POST /api/travel  { from, to, mode }
├─ components/
│  ├─ AppShell.tsx               Navigatie + globale "+ Activiteit toevoegen"
│  ├─ ActivityForm.tsx           Toevoegen/bewerken/verwijderen + herhaling
│  ├─ ActivityCard.tsx           Activiteit incl. reistijd en vertrektijd
│  ├─ WeekGrid.tsx               Weekraster op tijdas, met reistijd als aanloop
│  ├─ MonthGrid.tsx              Maandraster met stippen en dagdetail
│  ├─ DayTimeline.tsx            Dagoverzicht met vertrekmomenten als eigen regel
│  ├─ LocationInput.tsx          Vrij typen + suggesties uit /api/geocode
│  ├─ NextUpCard.tsx             "Eerstvolgende activiteit" met aftelling
│  └─ ui.tsx                     Spinner, lege staat, foutmelding
├─ hooks/
│  ├─ useAgenda.tsx              Store: activiteiten, instellingen, herberekening
│  └─ useNow.ts                  Klok voor "eerstvolgende" en de aftelling
└─ lib/
   ├─ types.ts                   Datamodel
   ├─ categories.ts              Categorieën, kleurenpalet en kleurkeuze
   ├─ time.ts                    Datum- en tijdhelpers
   ├─ travel.ts                  Vertrektijdberekening + geldigheid reistijd
   ├─ recurrence.ts              Wekelijkse herhaling: weekdagen en uitzonderingen
   ├─ agenda.ts                  Selectors: dag, week, tijdlijn, eerstvolgende
   ├─ places.ts                  Opgeslagen locaties en vaste plek per categorie
   ├─ backup.ts                  Import/export-formaat, validatie en normalisatie
   ├─ schoolwork.ts              Sortering, prioriteitskleuren en "dagen tot"
   ├─ storage.ts                 Persistentie (localStorage)
   ├─ api.ts                     Client voor /api/*
   └─ server/                    Alleen server: config, cache, geocoding, routing
```

## Hoe het slimme gedrag werkt

Elke berekende reistijd wordt opgeslagen met een sleutel:
`thuis-coördinaten → bestemming-coördinaten @ vervoersmiddel`. Zodra die sleutel niet meer
klopt — je verandert de locatie van een activiteit, of je thuislocatie in de instellingen —
haalt de store automatisch een nieuwe reistijd op voor alle betrokken activiteiten.

De **vertrektijd is afgeleid**, niet opgeslagen. Verschuif je Gym van 18:00 naar 19:00, dan
schuift de vertrektijd direct mee zonder onnodige API-aanroep.

Activiteiten **zonder locatie** (bijvoorbeeld koken) tonen geen reistijd en geen vertrektijd.

### Terugreis

Voor elke activiteit met een locatie wordt ook de rit **terug naar huis** berekend, zodat je
onder de activiteit ziet hoe laat je thuis bent. Heen en terug worden apart opgehaald — door
eenrichtingsverkeer en afslagen verschillen ze in de praktijk (bv. 32 min heen, 31 min terug),
dus spiegelen zou een verkeerd antwoord geven.

De veiligheidsmarge telt hier bewust **niet** mee: die bestaat om op tijd aan te komen, niet om
een schatting van je thuiskomst op te rekken.

Let op: de app gaat ervan uit dat je na elke activiteit naar huis gaat. Plan je twee dingen
achter elkaar, dan zie je dus zowel de terugreis van de eerste als de heenreis van de tweede.


### Opgeslagen locaties

Je hoeft een adres maar één keer te zoeken. Vink bij een activiteit **"Onthouden als vaste
locatie voor 🏋️ Gym"** aan (staat standaard aan bij een nieuwe activiteit) en de app:

- bewaart de locatie in **Instellingen → Opgeslagen locaties**, waar hij als snelkeuze-knopje
  in elk locatieveld verschijnt;
- maakt hem de **vaste locatie van die categorie**, zodat hij automatisch wordt ingevuld
  zodra je die categorie kiest.

Wisselen van categorie wisselt een **automatisch ingevulde** locatie mee; een locatie die je
zelf koos blijft staan. Bij het bewerken van een bestaande activiteit staat het vinkje uit,
zodat je vaste locatie niet ongemerkt verandert.

Een locatie verwijderen kan in de instellingen; de categorie die hem als vaste plek gebruikte
raakt dan enkel die koppeling kwijt.

### Kleuren

Elke categorie heeft een standaardkleur (school blauw, werk grijsblauw, gym groen, koken
oranje, hobby paars). In het formulier kun je onder **Kleur** een eigen kleur kiezen; die
overschrijft de categoriekleur in alle weergaven. `Standaard` zet hem terug.

### Weergaven

De agenda heeft vier tabbladen:

- **Vandaag** en **Morgen** — lijst met alle details per activiteit.
- **Week** — een raster van ma t/m zo op een tijdas. De reistijd staat als
  gestreept blok direct boven de activiteit, dus je ziet je vertrekmoment op de
  tijdlijn staan. Overlappende activiteiten komen naast elkaar. Met de knop
  **Raster / Lijst** schakel je naar de lijstweergave, die op een smal scherm
  prettiger leest.
- **Maand** — een maandraster met een gekleurde stip per activiteit; tik een dag
  aan en de volledige dag verschijnt eronder, inclusief vertrektijden.

Het tijdvenster van het weekraster past zich aan: het loopt van een uur vóór je
vroegste vertrek tot een uur na je laatste activiteit.

### Herhalende activiteiten

Zet **🔁 Herhalen** aan in het formulier en kies de weekdagen — bijvoorbeeld ma t/m do voor
werk. De datum wordt dan de **startdatum** van de reeks; optioneel stel je een einddatum in.

Een reeks wordt éénmaal opgeslagen en per dag uitgeklapt bij het tonen
(`src/lib/recurrence.ts`). Dat betekent dat de reistijd ook maar één keer wordt opgehaald en
op elke dag van de reeks geldt.

Bij het verwijderen van een dag uit een reeks krijg je de keuze:

- **Alleen deze dag** — die datum komt in `exceptions` en wordt overgeslagen.
- **Hele reeks** — de activiteit verdwijnt helemaal.

Andere wijzigingen (tijd, locatie, categorie) gelden altijd voor de hele reeks; dat staat ook
zo in het formulier vermeld.

### Schoolwerk

Het tabblad **Schoolwerk** toont je opdrachten en toetsen, zoals aangeleverd door je planner
(Claude in een aparte chat). De app berekent hier zelf niets — hij leest de data getrouw in.

- **Opdrachten** staan op deadline gesorteerd, met een prioriteitskleur (🔴 hoog, 🟠 middel,
  🟡 laag, 🟢 later), de deadline met "over X dagen", de geschatte tijd en de status. Zijn er
  stappen, dan staan die als afvinkbare checklist.
- **Toetsen** staan op datum, met de te leren onderwerpen en "dagen tot toets".
- De **status** (te doen / bezig / klaar) en losse stappen zet je hier direct om.

Leer- en werkblokken uit je planner komen binnen als gewone activiteiten met
`category: "school"` en `source: "leerplan"`; ze lopen mee in alle agenda-weergaven en krijgen
daar een subtiel **📚 leerplan**-label.

## Back-up & synchronisatie (import/export)

Onder **Instellingen → Back-up & synchronisatie** deel je exact dezelfde data met je planner via
één JSON-bestand:

```json
{ "app": "vertrektijd-agenda", "version": 2, "exportedAt": "<ISO>",
  "settings": { ... }, "activities": [ ... ], "tasks": [ ... ], "exams": [ ... ] }
```

- **Exporteren** downloadt dit als `vertrektijd-agenda.json`.
- **Importeren** leest een bestand in. Het `app`-veld en de versie worden gecontroleerd,
  onbekende velden genegeerd en ontbrekende velden krijgen een veilige standaardwaarde, zodat de
  app nooit crasht op een handmatig gemaakt bestand. Twee modi:
  - **Samenvoegen** (standaard): upsert op `id` voor activiteiten, taken en toetsen; instellingen
    worden alleen overschreven als het bestand ze bevat.
  - **Vervangen**: de hele agenda wordt gelijk aan de inhoud van het bestand.
- Na afloop volgt een korte samenvatting (x activiteiten, y taken, z toetsen
  toegevoegd/bijgewerkt). Reistijden van nieuwe of gewijzigde activiteiten worden daarna
  automatisch herberekend via de bestaande logica.

De opslag draait op schemaversie 2: taken en toetsen staan naast de bestaande activiteiten en
instellingen, die onder hun eigen sleutels blijven staan. Bestaande data gaat dus niet verloren
en ontbrekende taken/toetsen worden een lege lijst.

### Formaatafspraak (voor de planner)

Dit formaat wordt **stabiel** gehouden: de planner (de andere Claude) baseert zijn bestanden
hierop. `app` blijft `"vertrektijd-agenda"` en de structuur blijft
`{ app, version, exportedAt, settings, activities, tasks, exams }`. `version` wordt alleen
verhoogd bij een echte wijziging, en oudere versies blijven inleesbaar. Onbekende velden worden
genegeerd; ontbrekende velden krijgen een veilige standaardwaarde.

Een volledig, geldig voorbeeld staat in
[`examples/planner-voorbeeld.json`](examples/planner-voorbeeld.json) — inclusief een leerblok dat
aan een toets is gekoppeld en een werkblok dat aan een opdracht is gekoppeld.

**`tasks[]` (opdrachten/huiswerk):**

| Veld | Type | Verplicht | Toelichting |
| --- | --- | --- | --- |
| `id` | string | ja | Stabiele id; gebruikt voor upsert bij samenvoegen. |
| `subject` | string | ja | Vak, bv. `"Wiskunde"`. |
| `title` | string | ja | Wat er moet gebeuren. |
| `description` | string | nee | Extra toelichting. |
| `deadline` | string | ja | `YYYY-MM-DD`. |
| `estimatedMinutes` | number | ja | Geschatte totale werktijd. |
| `priority` | `"high"｜"medium"｜"low"｜"later"` | ja | 🔴 / 🟠 / 🟡 / 🟢. |
| `status` | `"todo"｜"doing"｜"done"` | ja | Voortgang. |
| `steps[]` | `{ id, title, estimatedMinutes?, done }` | nee | Afvinkbare deelstappen. |
| `createdAt` / `updatedAt` | string (ISO) | ja | Tijdstempels. |

**`exams[]` (toetsen):** zelfde `priority`/`status`/tijdstempels, met `id`, `subject`,
`title?`, `date` (`YYYY-MM-DD`), `topics?` (string[]) en `prepMinutes?` (number).

**`activities[]` (agenda):** het bestaande activiteitsmodel. Voor leer-/werkblokken uit het
leerplan: zet `category: "school"` en `source: "leerplan"`. Koppel een blok aan schoolwerk met
`linkedTaskId` of `linkedExamId` (de `id` van een taak of toets); de app toont dan bij die taak/
toets hoeveel leertijd is ingepland en labelt het blok in de agenda.

## Account & synchronisatie

De app werkt standaard lokaal (localStorage). Optioneel kun je login met e-mail + wachtwoord en
cloud-synchronisatie tussen apparaten activeren met een gratis **Supabase**-project. Eenmalige
instelstappen (project, database-schema, sleutels in Vercel) staan in
[`SUPABASE-SETUP.md`](SUPABASE-SETUP.md). Zonder de env-variabelen
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` blijft alles lokaal en verandert er
niets. Elke gebruiker heeft alleen toegang tot zijn eigen data (Row Level Security).

## Klaar voor later

Het model is bewust ruim opgezet, maar deze functies zijn nog **niet** gebouwd:

- `TravelMode` kent al `bike`, `walk` en `transit`; de routingproviders hebben de profielen
  al gemapt, alleen de UI-keuze ontbreekt.
- `Recurrence.freq` staat op `"weekly"`; dagelijks of maandelijks kan er later bij zonder de
  opgeslagen gegevens te breken.
- `Activity.bufferMinutes` maakt een marge per activiteit mogelijk naast de globale marge.
- De provider-abstractie in `src/lib/server/` maakt ruimte voor verkeersinformatie of een
  andere routeservice zonder de rest van de app aan te raken.
- De opslaglaag maakt synchronisatie met Google/Apple Calendar of een server-backend mogelijk
  zonder de componenten te wijzigen; de JSON-import/export is hiervan de eerste bouwsteen.
- `Task`/`Exam` kennen `linkedTaskId`/`linkedExamId` op `Activity`, zodat een leerblok later
  expliciet aan een opdracht of toets gekoppeld kan worden in de UI.

## Scripts

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run typecheck
```

## Problemen oplossen

**`Cannot find module './586.js'` of andere ontbrekende chunks**

De build-cache is stuk. Dat gebeurt vooral wanneer `npm run build` draait terwijl
`npm run dev` nog openstaat: de productiebuild overschrijft dezelfde `.next/`-map.
Stop de dev-server, gooi de cache weg en start opnieuw:

```bash
rm -rf .next && npm run dev
```

Op Windows PowerShell:

```bash
Remove-Item -Recurse -Force .next; npm run dev
```

Draai `npm run build` dus niet tegelijk met `npm run dev`. Voor een snelle controle op
typefouten kun je wel gerust `npm run typecheck` naast de dev-server gebruiken.
