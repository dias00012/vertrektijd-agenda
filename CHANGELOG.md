# Changelog

Kort overzicht per versie van wat er in de app is veranderd. Bedoeld zodat de
planner (de andere Claude) snel ziet wat er nieuw is.

Het **uitwisselformaat** (`app`, `version`, `settings`, `activities`, `tasks`, `exams`)
wordt bewust stabiel gehouden. De veldenlijst en een voorbeeldbestand staan in de
[README](README.md#back-up--synchronisatie-importexport) en in
[`examples/planner-voorbeeld.json`](examples/planner-voorbeeld.json).

## 0.12.1

- **Gedachtestreepjes weg uit alle teksten.** Overal in de app, en in de README en dit bestand,
  staat nu gewone interpunctie: een punt, een komma, een dubbele punt of haakjes.
- **Naam "Vertrektijd" uit de zijbalk.** Die stond boven de navigatie en linkte naar Vandaag,
  wat er direct onder al staat.
- **Tussenruimte in Instellingen hersteld.** De kaarten Account & synchronisatie en Mijn
  thuislocatie stonden tegen elkaar aan, de rest niet.

## 0.12.0

- **Echte rondleiding door de app.** De rondleiding navigeert nu naar elk tabblad (Vandaag,
  Agenda, Reizen, Schoolwerk, Instellingen) met een klein paneel onderaan dat uitlegt wat je op
  dat moment vóór je ziet. De pagina erachter blijft zichtbaar; dat is het hele punt.
  Te starten via Instellingen of aan het eind van de startwizard. Pijltjestoetsen bladeren,
  Escape sluit.
- **Introductie terug te vinden** in Instellingen, met je huidige instellingen al ingevuld.

## 0.11.0

- **Werkt zonder bereik.** Een service worker bewaart de app zelf, zodat je in de trein of in een
  tunnel je planning gewoon ziet. Reistijden (`/api/*`) worden nooit bewaard: een verouderde
  vertrektijd is erger dan geen. Lukt een pagina niet, dan verschijnt `/offline` in plaats van
  een foutscherm.
- **Startwizard.** Bij de eerste keer openen vraagt de app om je thuislocatie, je vervoermiddel
  en je gewenste speling. Daarna werkt alles meteen.
- **Live vertragingen in je agenda.** Een OV-rit van vandaag wordt elke twee minuten ververst, en
  meteen wanneer je terugkeert naar de app. Is je trein vertraagd, dan kleurt je vertrektijd
  oranje met de dienstregelingstijd doorgestreept ernaast; uitgevallen ritten staan in rood.
- **Herinneringen.** Stel in Instellingen in hoeveel minuten van tevoren je een melding wilt.
  Werkt zolang de app open staat (ook op de achtergrond); dat staat er eerlijk bij.
- **Nette foutpagina's** in plaats van een wit scherm, en optionele foutrapportage via
  `NEXT_PUBLIC_SENTRY_DSN`. Zonder die instelling gaat er niets naar buiten.

## 0.10.0

- **Verkeersdrempel op `/api/*`.** Achter die routes zitten gratis diensten die op fair use
  draaien; zonder rem kon één script ze voor alle gebruikers laten blokkeren. Per IP: geocode
  30/min, reistijden 60/min, reisplanner 25/min.
- **Privacyverklaring** op `/privacy`: wat we bewaren, wat er naar buiten gaat (alleen
  coördinaten en tijden, nooit namen of afspraken) en hoe je alles weer weghaalt.
- **Account verwijderen** met bevestigingsstap, in Instellingen. Vereist
  `SUPABASE_SERVICE_ROLE_KEY` als serverinstelling; zonder die sleutel meldt de app netjes dat
  het handmatig moet.
- **Automatische tests** (Vitest, 45 stuks) over tijdrekenen, herhalingen, vertrek- en
  thuiskomsttijd (auto én OV) en de sync-samenvoeging die dataverlies moet voorkomen.
  Draaien met `npm test`.

## 0.9.0

- **Echte laptoplayout.** Vanaf 1024 px staat de navigatie links als zijbalk, verdwijnt de
  telefoon-onderbalk en krijgt de inhoud meer breedte, zodat het weekraster zijn zeven kolommen
  nu echt kan gebruiken. Op telefoon en tablet verandert er niets.
- **Bedienbaar zonder muis.** Alles wat je met Tab kunt bereiken krijgt een zichtbare
  focusrand (`:focus-visible`), zodat toetsenbord- en schermlezergebruikers zien waar ze zijn.

## 0.8.2

- **Wachtwoord vergeten.** Onder het inlogscherm staat nu "Wachtwoord vergeten?". Je krijgt een
  herstelmail met een link naar `/wachtwoord`, waar je een nieuw wachtwoord kiest. De melding
  verklapt niet of een e-mailadres bekend is.
- **Duidelijkere inlogfouten.** "Email logins are disabled", "Email not confirmed" en
  "too many requests" worden vertaald naar begrijpelijk Nederlands met wat je eraan kunt doen.

## 0.8.1

- **Snelkeuzes voor locaties blijven staan.** In de reisplanner verdwenen Thuis, Gym en School
  bij "Van" zodra er al een locatie stond. Ze blijven nu staan met de actieve gemarkeerd, zodat
  je met één tik van vertrekpunt wisselt.

## 0.8.0

- **OV-reis per dag, in je agenda.** Bij een herhalende activiteit stond overal dezelfde rit:
  die van de eerstvolgende keer. Nu haalt de app voor elke dag de rit van díé dag op, zodat
  donderdag niet de trein van maandag laat zien. Je ziet per dag je vertrektijd, welke trein en
  bussen je pakt, van welk spoor, waar je overstapt en **hoe lang je in totaal loopt**. Bij je
  eerstvolgende activiteit staat de reis meteen open.
- **Locaties heten waar je heen gaat.** Overal in de app stond een adres als "19, Almere" of
  "2S, Zwolle". Nu staat er 🏫 School, 💼 Werk, 🏋️ Gym of 🏠 Thuis, met het adres eronder.
  Via Instellingen → Opgeslagen locaties geef je met ✎ een eigen naam ("Bijbaan", "Windesheim").
- **Betere adresnamen.** Bij een huisadres gaf de zoekdienst alleen het huisnummer terug ("60").
  Nieuwe zoekopdrachten geven nu de straatnaam erbij ("Wisselweg 60, Almere").
- **"Lopen" is weg** als vervoermiddel; je kiest tussen 🚗 auto, 🚲 fiets en 🚆 OV. Loopstukken
  binnen een OV-reis blijven natuurlijk gewoon staan.
- Techniek: `SavedPlace` heeft een optionele `customName`. Het uitwisselformaat blijft `version` 2
  en volledig compatibel.

## 0.7.0

- **Reisplanner-tab (zoals 9292).** Nieuw tabblad **Reizen**: zoek van A naar B met trein, bus,
  tram en metro. Meerdere reisopties onder elkaar, bladeren naar eerdere/latere ritten, en
  **live vertragingen** (geplande tijd doorgestreept, werkelijke tijd in oranje). Uitklappen toont
  de hele rit met lijn, richting, **spoor** en overstappen. Zoeken kan op halte/station, op adres,
  vanaf **je huidige locatie** of met één tik vanaf **thuis**.
- **Eigen activiteitstypes.** Naast de vijf standaardtypes maak je nu je eigen type met een
  **zelfgekozen emoji van je toetsenbord** (Windows: Win + `.` · Mac: Ctrl + Cmd + spatie), een
  eigen naam en kleur. Ze verschijnen overal in de app.
- **Schoolwerk zelf toevoegen.** Opdrachten en toetsen kun je nu zelf aanmaken, bewerken en
  verwijderen, inclusief stappen, prioriteit, status en geschatte tijd. Voorheen kon dat alleen
  via een importbestand.
- **"Standaard"-knoppen weg** bij Kleur en bij "Hoe reis je hierheen?". Je ziet nu meteen welke
  kleur en welk vervoermiddel gelden; de kleur volgt je type tenzij je hem zelf kiest.

## 0.6.0

- **OV-reisplanner.** Kies per activiteit **🚗 auto, 🚲 fiets, 🚶 lopen of 🚆 OV**. Bij OV zoekt de
  app een echte rit die je op tijd laat aankomen en toont hij de hele reis: lopen naar de halte,
  welke trein/bus/metro, richting, **spoor**, overstappen en aankomsttijden, heen én terug.
  Je vertrektijd komt dan uit de dienstregeling in plaats van uit een rekensom.
- **Fiets- en looptijden zijn nu écht.** De gratis OSRM-server gaf voor auto, fiets en lopen
  dezelfde tijd (hij kent alleen het autoprofiel). Fiets en lopen lopen nu via MOTIS:
  9,5 km werd 13 min "fiets" en is nu 29 min, en lopen 133 min.
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
  in één oogopslag wat gedaan is en wat er nu/volgende op de planning staat, in de agenda-lijsten
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
