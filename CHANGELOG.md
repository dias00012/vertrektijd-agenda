# Changelog

Kort overzicht per versie van wat er in de app is veranderd. Bedoeld zodat de
planner (de andere Claude) snel ziet wat er nieuw is.

Het **uitwisselformaat** (`app`, `version`, `settings`, `activities`, `tasks`, `exams`)
wordt bewust stabiel gehouden. De veldenlijst en een voorbeeldbestand staan in de
[README](README.md#back-up--synchronisatie-importexport) en in
[`examples/planner-voorbeeld.json`](examples/planner-voorbeeld.json).

## 0.6.0

- **OV-reisplanner.** Kies per activiteit **🚗 auto, 🚲 fiets, 🚶 lopen of 🚆 OV**. Bij OV zoekt de
  app een echte rit die je op tijd laat aankomen en toont hij de hele reis: lopen naar de halte,
  welke trein/bus/metro, richting, **spoor**, overstappen en aankomsttijden — heen én terug.
  Je vertrektijd komt dan uit de dienstregeling in plaats van uit een rekensom.
- **Fiets- en looptijden zijn nu écht.** De gratis OSRM-server gaf voor auto, fiets en lopen
  dezelfde tijd (hij kent alleen het autoprofiel). Fiets en lopen lopen nu via MOTIS:
  9,5 km werd 13 min "fiets" en is nu 29 min — en lopen 133 min.
- **Standaard vervoermiddel** in Instellingen; per activiteit kun je afwijken.
- Techniek: MOTIS/transitous (gratis, zonder sleutel, wereldwijde GTFS-dekking). Auto blijft OSRM.
  `TravelInfo` heeft nu optioneel `legs`, `transfers`, `plannedDeparture` en `plannedArrival`.
  Het uitwisselformaat blijft compatibel (`version` 2).

## 0.5.3

- **"Mijn weekplanning" verwijderd.** De vaste, in de code ingebakken standaardweek is weg; de
  planner levert je week nu persoonlijk via de JSON-import, wat flexibeler is. `src/lib/weekPlan.ts`
  is verwijderd.
- **Account & synchronisatie bovenaan** in Instellingen gezet.

## 0.5.2

- **Terugreis-tijd zichtbaar in het weekraster.** De thuiskomsttijd van korte ritten (zoals de
  gym) werd verborgen omdat het blokje te laag was; het label verschijnt nu ook bij korte
  reisblokken (heen én terug).

## 0.5.1

- **Sync voegt nu samen i.p.v. overschrijven.** Bij inloggen op een tweede apparaat worden
  lokale en cloud-gegevens gecombineerd (union op id, meest recente wijziging wint). Zo
  verschijnen je opgeslagen locaties en weekplanning ook op je telefoon, en kan een leeg
  apparaat je bestaande data niet meer wissen.

## 0.5.0

- **Accounts & synchronisatie (optioneel).** Je kunt nu een account aanmaken met e-mail +
  wachtwoord en inloggen via **Instellingen → Account & synchronisatie**. Ingelogd worden je
  agenda, schoolwerk en instellingen bewaard in je account en gedeeld tussen apparaten. Zonder
  account werkt de app lokaal precies zoals voorheen.
- Techniek: Supabase (auth + database, gratis laag) met Row Level Security; alles staat per
  gebruiker in één rij. Zie [`SUPABASE-SETUP.md`](SUPABASE-SETUP.md) voor het eenmalig instellen.
- De serverkant (`src/lib/server/*`, `/api/*`) en het uitwisselformaat zijn ongewijzigd.

## 0.4.2

- **Voorbije blokken gedempt.** Activiteiten die vandaag al voorbij zijn, worden grijs weergegeven
  met een "✓ geweest"-label; de lopende activiteit krijgt een accentrand en "● bezig". Zo zie je
  in één oogopslag wat gedaan is en wat er nu/volgende op de planning staat — in de agenda-lijsten
  en in het dagoverzicht op het dashboard.
- **Terugreis self-healing bevestigd.** Gym-/activiteitenblokken van vóór de terugreis-functie
  krijgen die reistijd terug-naar-huis nu automatisch bij het openen van de app.

## 0.4.1

- **Robuustere import.** Bij "samenvoegen" kan een bestand je thuislocatie of opgeslagen locaties
  niet meer per ongeluk wissen met lege (`null`) waarden; alleen echt ingevulde instellingen
  worden overgenomen. Bij "vervangen" geldt het bestand onverkort.
- **Duidelijker "eerstvolgende activiteit".** Het dashboard toont nu bij een leerblok voor welke
  opdracht of toets het is, en voor blokken zonder locatie de starttijd in plaats van
  "je hoeft nergens naartoe".

## 0.4.0

- **Koppeling zichtbaar gemaakt.** Bij een opdracht en toets toont de app nu hoeveel leertijd
  al is ingepland (som van de gekoppelde blokken) t.o.v. de schatting, met een voortgangsbalk.
- **Gekoppelde blokken herkenbaar in de agenda.** Een activiteit met `linkedTaskId`/`linkedExamId`
  toont het vak en de naam van de opdracht/toets; leer-/werkblokken (`source: "leerplan"`) krijgen
  een 📚-markering in de dagtijdlijn.
- **Dashboard "Vandaag".** Nieuw blok "Schoolwerk vandaag": totale leertijd van vandaag, de
  eerstvolgende deadline en de eerstvolgende toets, met een link naar Schoolwerk.
- **Onderhoud.** Next.js bijgewerkt naar 15.5.25 (beveiligingspatches). Geen wijziging aan het
  uitwisselformaat: `version` blijft 2.

## 0.3.0

- **Schoolwerk-tabblad**: opdrachten op deadline met prioriteitskleur, geschatte tijd, status en
  afvinkbare stappen; toetsen op datum met onderwerpen en "dagen tot toets".
- **Import/export** (Instellingen → Back-up & synchronisatie): de hele agenda als één JSON-bestand,
  met samenvoegen (upsert op id) of vervangen. Uitwisselformaat op `version` 2.
- Datamodel uitgebreid met `Task`, `Exam` en optionele `linkedTaskId`/`linkedExamId` op `Activity`.

## 0.2.0

- Weekplanning in één keer instellen, week- en maandweergave, eigen kleuren per activiteit,
  reistijd terug naar huis, en opgeslagen locaties per categorie.

## 0.1.0

- Eerste versie: activiteiten met automatische reistijd en vertrektijd, herhalende activiteiten,
  dashboard, agenda en instellingen. Reistijd via een server-side routeservice.
