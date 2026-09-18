# Changelog

Kort overzicht per versie van wat er in de app is veranderd. Bedoeld zodat de
planner (de andere Claude) snel ziet wat er nieuw is.

Het **uitwisselformaat** (`app`, `version`, `settings`, `activities`, `tasks`, `exams`)
wordt bewust stabiel gehouden. De veldenlijst en een voorbeeldbestand staan in de
[README](README.md#back-up--synchronisatie-importexport) en in
[`examples/planner-voorbeeld.json`](examples/planner-voorbeeld.json).

## 0.89.0

Vier gaten in de dekking, op de plekken waar een stille fout het meeste kost.

- **De offline-belofte wordt nu bewaakt.** De service worker zegt het zelf:
  juist in de trein, in een tunnel of op een station met slecht bereik wil je
  zien hoe laat je moet vertrekken. Dat wérkte -- nagemeten met het bereik uit
  -- maar er stond niets op dat het zo blijft. Eén verkeerde wijziging en het
  is stil kapot; je merkt het ondergronds, precies wanneer je er niets meer aan
  kunt doen.

  Twee browsertests: je agenda opent zonder bereik, en ook een scherm dat je in
  die sessie nog niet geopend had. Dat tweede is waar het eerder op misging --
  binnen de app wisselt een tab zonder echte navigatie, dus de worker zag die
  schermen nooit langskomen.

- **De twee lijsten die gelijk moeten blijven, blijven dat nu ook.** Het menu
  staat in `AppShell` en de voorlaadlijst van de service worker in
  `public/sw.js`. Ze klopten, maar niets dwong dat af: voeg een tabblad toe en
  vergeet de worker, en dat scherm doet het niet zonder bereik. Geen
  foutmelding, geen waarschuwing.

  Het menu staat nu in `src/lib/nav.ts` en een test legt de twee naast elkaar.
  Een service worker kan geen module importeren, dus die lijst blijft daar
  noodgedwongen staan -- maar hij kan niet meer stilletjes uit de pas lopen.

- **De zwaarste beslissing uit `useAgenda` is eruit gehaald en getest.** Welke
  activiteiten krijgen een reistijd, en in welke volgorde? Daar zit een echt
  incident achter: een gekoppeld rooster staat er voor een heel semester in, en
  zonder de grenzen werden dat honderden aanvragen ineens aan de gratis
  OV-dienst -- waarvan het grootste deel stukliep op onze eigen
  verkeersdrempel, met lege vertrektijden als resultaat.

  Dat stond in een hook en was dus niet na te rekenen. Nu `travelQueue` in
  `src/lib/travelQueue.ts`, met de klok als parameter, met elf tests: de
  horizon van een week, de wachttijd na een mislukte rit, en de volgorde
  (dichtstbijzijnde dag eerst, zodat bij een grens de verste dag sneuvelt en
  niet die van morgenochtend).

  De functie ruimt niet meer stilletjes de mislukt-lijst op maar geeft terug
  welke sleutels eraf mogen. Dat stille opruimen was precies wat de code
  onnavolgbaar maakte.

- **`src/lib/api.ts` heeft tests.** Alles wat de browser aan de server vraagt
  gaat hierdoorheen. Twaalf tests over wat er misgaat: geen verbinding (dan
  hoort er geen "Failed to fetch" op je scherm te staan), een afgebroken
  zoekopdracht die géén storing is, een server die HTML terugstuurt in plaats
  van een melding, en een adres met een `&` erin dat de rest van de vraag niet
  mag omgooien.

- **Alle 25 nieuwe tests zijn nagelopen door de code expres te breken.** Vijftien
  mutaties, veertien betrapt. De vijftiende niet, en dat staat in de test erbij:
  de controle op een ontbrekende bestemming is dubbel dichtgezet, want
  `needsTravelRefresh` valt zonder bestemming al af. Geen testgat maar een
  vroege afslag die een berekening per activiteit scheelt.

## 0.88.0

- **"Laatste rit vanavond."** Zit je 's avonds op school, dan is de vraag niet
  "hoe laat wil ik aankomen" maar "hoe laat moet ik uiterlijk weg om vanavond
  nog thuis te komen". Daarvoor moest je zelf een tijdstip invullen en dan
  doorbladeren.

  Eén knop nu. Onder water is het een gewone zoekopdracht op aankomst met
  middernacht als grens -- dus wijst het merkje "laatste op tijd" uit 0.87.0
  vanzelf de goede rit aan. Tegen de echte dienst:

      21:10 -> 21:59
      21:40 -> 22:29
      22:10 -> 22:59
      22:40 -> 23:29
      23:10 -> 23:59  <- laatste op tijd

  Rijdt er daarna nog iets, dan staat dat gewoon in de gewone zoekopdracht, met
  de dag erbij. De knop verzwijgt niets, hij beantwoordt één vraag.

- **Van de planner naar je agenda.** Andersom kon al -- de agenda linkt door
  naar de planner met de bestemming erin -- maar deze kant niet. Een rit die je
  net gevonden had, tikte je alsnog met de hand over.

  Onder een uitgeklapte rit staat nu "Zet in agenda". Dat opent het gewone
  activiteitenformulier met de bestemming en de aankomsttijd er al in. Bewust
  geen activiteit die stilletjes wordt aangemaakt: welk type het is en hoe het
  heet weet alleen jij.

  De begintijd is je aankomst, niet je vertrek. De agenda rekent de vertrektijd
  zelf uit en houdt hem bij met de vertragingen van dat moment; zou de rit als
  blok in je agenda staan, dan stond er straks een tijd van vandaag bij een dag
  van volgende week.

- **Drie rekentests en twee browsertests erbij**, nagelopen door de code op vier
  plekken te breken -- vier mutaties, vier keer betrapt. De test op de knop
  kijkt niet alleen naar het antwoord maar ook naar de vraag: er hoort om
  aankomst gevraagd te worden, met vandaag als grens.

## 0.87.0

Drie dingen in de reisplanner, gevonden door hem tegen de echte dienst te
houden en de antwoorden naast het scherm te leggen.

- **Bij "uiterlijk aankomen om" stond de verkeerde rit bovenaan.** Gevraagd:
  ik moet om 14:00 in Zwolle zijn. Wat je kreeg:

      vertrek 11:01  aankomst 11:48   <- bovenaan
      vertrek 11:31  aankomst 12:17
      vertrek 12:01  aankomst 12:48
      vertrek 12:31  aankomst 13:17
      vertrek 13:01  aankomst 13:48   <- dit was je vraag

  De lijst staat op vertrektijd, zoals een vertrekbord. Dat klopt bij
  "vertrekken vanaf nu", maar bij "uiterlijk aankomen om" is de laatste rit die
  het nog haalt precies het antwoord -- en die staat onderaan. De bovenste zet
  je er twee uur te vroeg af.

  Die rit heeft nu een merkje, net als de snelste. Markeren en niet omdraaien:
  de volgorde van een vertrekbord is vertrouwd, en "eerder" en "later" blijven
  kloppen. Een uitgevallen rit telt niet mee -- die haalt het per definitie
  niet.

- **Een rit van morgen zag eruit als een rit van vanavond.** Gezocht op
  vrijdag om 23:15, terug van Zwolle naar Almere: zes opties, waarvan er vijf
  op zaterdag vallen. Op de kaart stond alleen een kloktijd, dus "05:40" las
  als een vroege trein in plaats van als een rit over zes uur.

  De dag staat er nu bij zodra een rit niet vandaag vertrekt, en een rit die na
  middernacht aankomt krijgt een `+1` achter de aankomsttijd -- anders leest
  "23:40 naar 00:29" als een reis terug in de tijd.

- **"spoor" stond hardgecodeerd in de lijst**, terwijl de vertaling bestond en
  het detailscherm hem gewoon gebruikte. Een Engelse gebruiker las dus
  "spoor 4" in de lijst en "platform 4" als hij doorklikte.

- **Dertien rekentests en drie browsertests**, nagelopen door de code expres te
  breken -- negen mutaties, negen keer betrapt. Eén daarvan ging bijna mis: de
  test op het spoor stond eerst in het Nederlands, en daar is de hardgecodeerde
  tekst toevallig gelijk aan de vertaling. Die slaagde dus ook met de fout er
  nog in. Nu in het Engels, waar het verschil zichtbaar is.

  De browsertests bellen de OV-dienst niet: een test die van een
  dienstregeling afhangt zegt morgen iets anders, en dan weet je bij rood niet
  of jouw app stuk is of hun trein. Wel is de uitkomst daarna tegen de echte
  dienst nagemeten, en daar wijst hij de goede rit aan.

## 0.86.0

- **Marge per activiteit.** Het veld ontbrak als enige van de "klaar voor
  later"-lijst: `Activity.bufferMinutes` bestond al en `bufferFor` gebruikte
  hem al, alleen kon je hem nergens invullen. Eén marge gold dus voor alles.

  Nu staat er bij een activiteit met een bestemming een veld "Marge voor deze
  activiteit". Voor de sportschool is vijf minuten genoeg, voor school wil je
  er twintig -- dat scheelt elke dag een kwartier onnodig vroeg weg.

  Leeg laten volgt de algemene marge uit Instellingen. Bewust geen voorgevuld
  getal: dat zou de algemene waarde bij het opslaan vastzetten op deze
  activiteit, en dan verandert hij niet meer mee als je hem in Instellingen
  aanpast. Bij OV zit de marge in de sleutel van de rit, dus een andere marge
  laat de app vanzelf een andere trein zoeken.

  Vier browsertests, nagelopen door de code op drie plekken te breken. De
  derde mutatie -- de marge wegvegen bij het *aanmaken* van een activiteit --
  glipte er eerst doorheen, omdat alle tests een bestaande activiteit
  bewerkten. Daar staat nu een test naast die er een nieuwe maakt.

- **De lijst "Klaar voor later" in de README klopte niet meer.** Vier van de
  zes punten waren allang gebouwd: vervoermiddel per activiteit, tweewekelijks
  en maandelijks herhalen, een leerblok koppelen aan een opdracht, en
  synchronisatie tussen je apparaten. Dat is vervelender dan het lijkt -- je
  gaat iets bouwen dat er al is, of je denkt dat de app minder kan dan hij kan.
  Er staat nu een tabel met wat er wél is, wat er echt nog niet is, en wat
  bewust niet komt (lopen als keuze).

- **Een merknaam uit de tests en het commentaar gehaald.** "Basic-Fit Almere
  Buiten" is geen adres, maar wel een specifieke vestiging, en dat botst met de
  regel dat er geen echte plekken in tests of documentatie staan. Nu een
  verzonnen naam.

## 0.85.0

- **Twee beveiligingscontroles hebben nu tests.** Bij de ronde in 0.81.0 heb ik
  ze gelezen en goed bevonden, maar gelezen is niet getest: een volgende
  wijziging kan ze stil kapotmaken.

  `rateLimit.ts` is het enige dat voorkomt dat één script de gratis OV- en
  adresdiensten voor iedereen laat blokkeren. Tien tests: hoeveel er precies
  doorgelaten wordt, dat bezoekers en routes elkaar niet in de weg zitten, dat
  het venster opnieuw begint, en dat er een `Retry-After` meekomt.

  `network.ts` houdt `/api/rooster` ervan af een deur naar binnen te worden.
  Dertien tests: een gewone naam die naar `127.0.0.1` wijst, het metadata-adres
  van de cloudprovider, een naam met meerdere adressen waarvan er één naar
  binnen wijst, en de groottegrens die tijdens het lezen al telt in plaats van
  achteraf.

- **De opslaglaag ook.** Daar gaat alles doorheen wat je bezit, en er stond
  geen enkele test op. Veertien stuks, over de gevallen die je pas merkt als
  het misgaat: onleesbare JSON na een afgebroken schrijfactie, een lijst die
  geen lijst blijkt, losse rommel tussen je activiteiten, instellingen uit een
  oudere versie, en een volle of geblokkeerde opslag (daar hoort `false` uit te
  komen -- mislukte het stil, dan was een avond invoeren na één keer herladen
  weg).

- **Een fout in de hoofdlayout laat de app niet meer leeg achter.** Er was
  `error.tsx`, maar die vangt alleen fouten ín een pagina: hij wordt zélf in de
  hoofdlayout getekend, dus als die omvalt is er niets om het in te tonen. Je
  kreeg dan de kale foutpagina van de browser, en Sentry hoorde er niets over.

  `global-error.tsx` staat daarom helemaal op zichzelf: eigen `<html>`, stijl
  in het bestand (het stijlblad wordt door de kapotte layout geladen) en de
  taal rechtstreeks uit de opslag in plaats van uit een provider die er dan
  niet is.

- **Alle 37 nieuwe tests zijn nagelopen door de code expres te breken.** Dertien
  van de veertien mutaties werden betrapt. De veertiende niet, en dat staat in
  de test erbij: de `Math.max(1, ...)` op `Retry-After` is onbereikbaar, want
  het venster wordt al ververst zodra de tijd om is. Geen testgat maar dubbele
  beveiliging.

## 0.84.0

- **Een hapering van de reisplanner gooide je vertrektijd weg.** Gevonden door
  de eerste browsertest te schrijven voor waar deze app voor bestaat: "hoe laat
  moet ik weg".

  Mislukte het berekenen van een reis, dan zette de app `travel: null` en liet
  alleen een rode regel zien. Dat werd bewaard én gesynchroniseerd, dus je
  laatst bekende vertrektijd was daarmee echt weg -- tot een volgende
  berekening wél lukte. 's Ochtends op je telefoon, als je naar je trein moet,
  stond er dan geen tijd.

  Weggooien hoefde ook niet: verandert de bestemming, dan worden de reistijden
  al apart opgeruimd. Wat er stond hoorde dus bij dezelfde reis, alleen
  berekend op een eerder moment. Nu blijft die staan, met de melding eronder
  dat hij van eerder is en kan afwijken. De kaart liet de storing ook nog eens
  vóórgaan op de tijd; dat is omgedraaid.

- **Drie browsertests over reistijd**, de eerste die deze kant van de app raken:
  de tijd van vanochtend wint van een berekening van gisteravond, een mislukte
  poging laat de oude tijd staan mét notitie, en een rit die al vertrokken is
  wordt niet meer opgehaald. De OV-dienst wordt niet echt gebeld -- een test
  die van een dienstregeling afhangt zegt morgen iets anders.

- **De browsertests hadden geen vaste klok, en één ervan slaagde daardoor om de
  verkeerde reden.** De tijdzone lag niet vast (de rekentests zijn wél op
  Amsterdam gepind) en "nu" was het echte moment van draaien. De test die
  controleert dat een leerblok nooit in je reistijd valt, slaagde alleen zolang
  hij vóór achten 's ochtends draaide.

  De klok staat nu vast op donderdag 17 september 2026, 07:00 in Amsterdam, en
  de tijdzone staat in de configuratie.

- **Twee van de nieuwe tests bleken eerst niets te toetsen.** Nagelopen door de
  logica expres te breken: de test over een vertrokken rit slaagde omdat de
  kaart 's avonds helemaal niet meer getekend werd, en omdat de gezaaide reis
  al als exact gold. Beide zijn rechtgezet en betrappen de mutatie nu wel.

  Wat niet lukte, en dat staat er ook bij: aanwijzen wélke laag een reis
  ververst heeft. Twee lagen doen dat werk en allebei verversen ze op ouderdom,
  dus op het scherm zie je hetzelfde. Deze tests toetsen wat de gebruiker ziet;
  de losse beslissing staat als `refreshDecision` in de rekentests.

## 0.83.0

- **De klok uit de reistijd-hook gehaald.** Blijven staan uit 0.82.0: de React
  Compiler wees `Date.now()` tijdens het renderen aan in
  `useOccurrenceTravel`. Er stond toen een uitzondering met uitleg, omdat dit
  de logica is waar de vertrektijden uit komen en dat geen zijsprong tijdens
  een framework-upgrade hoorde te zijn.

  Bij het oplossen bleken het er **drie** te zijn, niet één: `offset` las de
  klok, `nowMs` las de klok, en `tripHasLeft` deed het via zijn
  standaardwaarde. Die konden onderling verschillen -- viel er een dag- of
  vertrekgrens tussen twee aflezingen, dan rekende dezelfde beslissing met twee
  verschillende "nu". Nu is er één klok, uit `useNow`: dezelfde die het
  dashboard en de agenda al gebruiken.

  Dat lost meteen iets op wat niemand gemeld had: het verversvenster ging
  vroeger pas open zodra er om een andere reden gerenderd werd. Nu tikt de klok
  en gaat het vanzelf open.

- **En die logica had geen enkele test.** Dat was het echte risico, niet de
  onzuiverheid. De beslissing "moet deze rit opgehaald worden, en doet hij er
  nu toe" zat verstopt in een hook, en hooks worden hier niet getest -- de
  browsertests gaan over schoolwerk en types en raken de reistijden niet.

  Die beslissing staat nu als `refreshDecision` in `src/lib/travel.ts`, met
  `now` als gewone parameter, en er zijn zeventien tests bij. Wat die
  vastleggen:

  - vandaag en tot eenentwintig dagen vooruit wordt opgehaald, een dag die
    voorbij is niet;
  - het verversvenster loopt van drie uur voor de start tot het einde, en geldt
    alleen vandaag -- ook bij een rit vlak na middernacht, waar het venster
    anders de avond ervoor al open zou gaan;
  - buiten dat venster wordt er wél voor het eerst opgehaald, want dat venster
    gaat over *opnieuw* ophalen;
  - een rit die al klopt maar ouder is dan twee minuten wordt alsnog opgehaald
    (de fout waardoor de vertrektijd van gisteravond bleef staan met "op tijd"
    erbij);
  - en zodra de rit vertrokken is stopt het, want dan heeft de planner geen
    dienstregeling meer.

  De tests zijn nagelopen door de logica expres op vier plekken te breken. Drie
  mutaties werden meteen betrapt; de vierde -- de eis dat het vandaag moet zijn
  -- glipte erdoor, omdat bij een rit overdag de tijd tóch al buiten het venster
  valt en de test dus om de verkeerde reden slaagde. Daar staat nu de rit vlak
  na middernacht, en die betrapt hem wel.

## 0.82.0

- **Next.js 15 → 16, React 19.1 → 19.3, vitest 3 → 5.** Aanleiding was een
  controle die vijf kwetsbaarheden meldde, waarvan twee hoog. Die zaten niet in
  deze app maar in wat Next meebracht (`postcss` en `sharp`), en `npm audit fix`
  kwam er niet bij: ze zaten vast in de afhankelijkheden van Next zelf. Vandaar
  de hoofdversie. Nu: **nul kwetsbaarheden.**

  De app zelf hoefde er niet voor te veranderen. Geen middleware, geen
  `next/image`, geen `next/font`, geen server-side `params` -- precies de
  dingen die Next 16 omgooit, en geen ervan zit hierin.

  Wat er wel omging:

  De officiële codemod zette overal `export const instant = false` neer, een
  opt-out voor Cache Components. Die functie staat in dit project niet eens
  aan, en de export is zonder die vlag ongeldig -- de typecontrole viel er
  meteen over. Weggehaald, zoals de codemod er zelf bij zet.

  De codemod tilde ESLint ook naar 10. Dat kan niet: `eslint-config-next` 16
  bundelt `eslint-plugin-react` 7.37.5, en die ondersteunt hoogstens ESLint 9.7
  (het viel om op een functie die in 10 is verdwenen). ESLint staat weer op 9.
  De `FlatCompat`-brug in `eslint.config.mjs` is wel weg: sinds
  eslint-config-next 16 zijn beide sets zelf al een flat config.

- **De regels van de React Compiler doen mee.** Die komen met Next 16 mee en
  vonden zevenentwintig plekken.

  Vijfentwintig zijn `setState` in een effect, en geen ervan is een fout: deze
  app bewaart alles in localStorage, dat bestaat niet op de server, dus lezen
  kan pas ná het mounten -- in precies zo'n effect. Die regel staat uit, met de
  reden in `eslint.config.mjs`. Een regel die permanent staat te waarschuwen
  leert mensen alleen om waarschuwingen te negeren.

  Eén is echt: `Date.now()` tijdens het renderen in `useOccurrenceTravel`. Dat
  is bewust -- de vraag is "doet deze reis er nú nog toe" en dat antwoord hóórt
  mee te veranderen met de tijd -- maar het is wel onzuiver. Er staat een
  gerichte uitzondering met uitleg; de regel blijft voor de rest van de code
  scherp staan. Het netjes oplossen raakt de logica waar de vertrektijden uit
  komen, en dat is geen klus om tijdens een framework-upgrade even mee te
  nemen.

  En één was gewoon dode code: `getoond` en `looptijd` in
  `scripts/overstap-vergelijking.mjs`, restanten van een eerdere versie van dat
  script. Weg.

- **Alles nagemeten.** 559 rekentests, 10 browsertests, typecontrole en lint
  schoon, alle negen pagina's 200, en de beveiligingsroutes doen nog precies
  wat ze deden: `/api/push/send` weigert zonder geheim, `/api/rooster` weigert
  het eigen netwerk en `file://`, en er staat geen enkel geheim in de
  browserbundel.

## 0.81.0

- **Een beveiligingsronde langs de hele app.** Geen melding vooraf, maar de
  vraag "waar zou dit misgaan" een keer systematisch langs elke route.

  Het meeste kwam schoon terug, en dat is ook een uitkomst: het weren van
  adressen in het eigen netwerk, het meelopen met omleidingen en opnieuw
  controleren bij elke stap, de grens op de omvang die al tijdens het lezen
  geldt, de drempels per route, de connector-token die als hash is opgeslagen.

  Drie dingen wel:

  `/api/push/send` vergeleek zijn geheim met `!==`. Dat stopt bij het eerste
  teken dat afwijkt, en wie mag blijven proberen en de tijd meet, leest het
  geheim daar teken voor teken uit. Het is het enige geheim in de app dat een
  buitenstaander zelf aanlevert, dus juist daar hoort het niet. Vergelijken
  gebeurt nu in `src/lib/secretEquals.ts`, op tijd-veilige manier, en die
  functie is er een voor alle gevallen -- hij stond al in `connectorToken.ts`
  met de aantekening dat hij ooit ergens anders nodig zou zijn.

  Afmelden voor meldingen (`DELETE /api/push/subscribe`) had als enige route
  geen drempel, terwijl hij twee tabellen aanraakt en niet om een wachtwoord
  vraagt. Twintig per uur nu, net als aanmelden.

  En de README beweerde dat er "geen enkele `NEXT_PUBLIC_`-variabele" is.
  Inmiddels zijn het er vier, allemaal terecht openbaar -- maar een
  documentatieregel die niet meer klopt is precies hoe er ooit wel een sleutel
  in de bundel belandt. Er staat nu welke vier het zijn, waarom dat mag, en dat
  er niets bij hoort te komen.

- **Het apparaat-id van de meldingen staat nu beschreven** als wat het is: een
  sleutel. Meldingen kennen geen account -- je telefoon verzint een willekeurig
  id en meldt zich daarmee aan -- en dat is met opzet, want zo hoeft de server
  niet te weten wie je bent. De keerzijde is dat wie dat id heeft een melding
  met eigen tekst voor jouw telefoon kan klaarzetten. Niet te raden en niet uit
  te lezen, wel weg te geven. Staat in de README, met wat je doet als het
  gebeurd is (meldingen uit en weer aan; dan is het oude id niets meer waard).

## 0.80.0

- **Tien tests die de app werkelijk openen** (Playwright, op een telefoonscherm).
  De 558 tests die er al waren rekenen allemaal: tijden, herhalingen,
  samenvoegen. Geen enkele deed wat een gebruiker doet, en dat is precies waar
  deze sessie doorheen viel -- een formulier dat een emoji eiste en een
  bewerkknop die nergens werd aangeroepen, zijn met rekentests niet te vangen.

  De eerste ronde vond meteen een aanraakvlak van 44 pixels dat er 43,99 bleek
  te zijn. Dat is de grens verlegd naar 48, niet de test verlaagd.

## 0.79.0

- **Echte woon- en werkadressen uit de repo gehaald.** Het thuisadres, het
  werkadres en de sportschool stonden vierenzestig keer verspreid door tests,
  commentaar, scripts en documentatie. De repo is openbaar, dus dat is iemands
  adres op internet, met zijn rooster erbij.

  Tests en commentaar geocoderen niets, dus daar staan nu overduidelijk
  verzonnen adressen met dezelfde plaatsnamen en dezelfde coordinaten: alle 558
  tests groen zonder een enkele aangepaste verwachting. De scripts roepen de
  echte geocoder aan en staan nu standaard op een stationsplein.

  Let op: dit haalt de adressen uit de huidige bestanden, niet uit de
  git-geschiedenis.

## 0.78.0

- **Een telling die niet aankomt is niet meer verloren.** Het dashboard stond op
  nul terwijl de app de hele dag gebruikt werd, door twee dingen tegelijk: de
  app streepte "vandaag geteld" af voordat hij het verstuurde, en `/api/stats`
  antwoordde "gelukt" ook toen de tabel nog niet bestond. De route zegt nu met
  `counted` of er werkelijk iets is opgehoogd, en de app onthoudt de dag pas
  dan. Het verzoek geeft altijd een 200: statistieken zijn nooit een reden om
  de app te storen.

## 0.77.0

- **Je apparaten werken elkaar nu live bij.** Plande je op je laptop iets in --
  zelf of via Claude -- dan stond het pas op je telefoon zodra je die oppakte.
  Nu duwt de database de wijziging erheen (Supabase realtime op `user_data`) en
  haalt het apparaat meteen op: binnen een seconde in plaats van bij de
  volgende keer dat je kijkt. Een apparaat negeert daarbij zijn eigen echo.

  Er is een regel SQL voor nodig (zie SUPABASE-SETUP.md). Laat je die weg, dan
  werkt de app gewoon zoals hiervoor.

## 0.76.0

- **Achterstallig werk valt nu op.** Een deadline die voorbij was kleurde de
  datum rood, maar de opdracht stond gewoon tussen de rest -- en met dertien
  opdrachten scrol je daaroverheen. Bovenaan Schoolwerk staat nu een regel
  wanneer er iets over tijd is, met een tik naar precies die dingen, plus een
  filterknop die alleen verschijnt als er iets over tijd is.

## 0.75.0

- **De app kan geen wijziging meer overschrijven.** De connector kreeg in 0.70.0
  een versiecontrole; de app zelf deed het nog op de oude manier, en tussen
  ophalen en terugschrijven paste precies een wijziging van je andere apparaat.
  Nu schrijft ook de app alleen als de rij nog is zoals hij hem las, en probeert
  hij het anders opnieuw op verse gegevens -- tot drie keer, daarna een eerlijke
  foutmelding.

  De logica staat nu een keer, in `src/lib/optimistic.ts`, en wordt door server
  en app gebruikt: twee versies hiervan naast elkaar liepen in deze app al twee
  keer uit de pas.

## 0.74.0

- **Claude kreeg geen reistijd te zien, en vulde dat zelf in.** "Claude zit er
  vaak naast met reistijden" bleek geen gokwerk van het model maar een gat in
  wat de app hem stuurt: de terugreis had een terugvaloptie, de heenreis niet.
  Zonder berekende heenreis stond er geen vertrektijd in het antwoord -- geen
  "onbekend", maar stilte. En stilte vult een planner in met iets plausibels.

  Nu is het symmetrisch: een ontbrekende heenreis wordt geschat uit de thuisreis
  met `departureEstimated` erbij, en is er in beide richtingen niets bekend, dan
  staat dat er met zoveel woorden. De beschrijving van `read_agenda` zegt nu
  ook: reken zelf nooit een reistijd uit en schat er nooit een.

## 0.73.0

- **Ook de standaardtypes zijn aan te passen.** "Gym" heet bij de een Sporten en
  bij de ander Fitness, en de kleur is smaak. Je aanpassing komt als
  `categoryOverrides` over het standaardtype heen; het id blijft staan, want
  daar hangen je activiteiten aan. Er wordt alleen bewaard wat je werkelijk
  anders maakte: verander je enkel de kleur, dan blijft de naam meelopen met de
  taal. Weggooien kan niet -- daar staat "Standaard herstellen".

- **Account, connector, back-up en rondleiding staan bovenaan Instellingen** in
  plaats van onderaan. Dat zijn de dingen waarvoor je daar komt.

## 0.72.0

- **Een beheerdersoverzicht op `/beheer`:** welke diensten het doen en hoe snel,
  hoeveel accounts er zijn, hoeveel mensen de app per dag openden. De
  afscherming zit in `/api/admin/overview` en niet in het scherm, want daar
  komen de gegevens langs; de route vergelijkt het e-mailadres uit het
  Supabase-token met `ADMIN_EMAILS` en antwoordt met 404 in plaats van
  "verboden". Staat die variabele leeg, dan kan niemand erbij.

## 0.71.0

- **Een emoji is niet meer verplicht bij een eigen type.** Dat is een rare eis
  aan iemand achter een laptop -- daar is het een sneltoets die je moet kennen,
  en wie die niet kende typte maar iets (er stond een type "Huiswerk" met een 7
  ervoor). Het icoonveld mag nu leeg; dan is het de eerste letter van de naam,
  bepaald bij het tonen zodat het meeverandert als je hernoemt.

- **Eigen types zijn te bewerken.** Dat bestond simpelweg niet: verwijderen zat
  al in de code maar werd nergens aangeroepen, bijwerken was er helemaal niet.
  Onder de tegels staat nu "bewerken" zodra je een eigen type kiest. En voor op
  de telefoon: tegels van 46 naar 62 pixels hoog, kleurstippen een raakvlak van
  44 in plaats van 24.

## 0.70.0

- **Twee oorzaken van de sportavond die bleef terugkomen.** `skip_occurrence`
  zei twee keer dat het gelukt was, maar bij opnieuw uitlezen stond sporten er
  weer. Twee onafhankelijke oorzaken, allebei echt.

  Twee verzoeken tegelijk lazen dezelfde rij en de laatste schreef eroverheen,
  terwijl beide "gelukt" antwoordden. De rij heeft al een `updated_at` -- die
  wordt nu gebruikt zoals bedoeld.

  En het verversen van een gekoppelde agenda wiste de overgeslagen dagen:
  `replaceActivities` zette `exceptions` onvoorwaardelijk leeg, en die
  verversing loopt vanzelf. Elke les die je voor een dag had weggehaald kwam zo
  terug.

- **`update_schoolwork` kan nu de prioriteit zetten.** Een rooster dat in een
  keer wordt ingevoerd zet alles op "hoog", en dan is rood geen signaal meer
  maar behang.

## 0.69.0

- **Drie gereedschappen erbij voor de connector.** Elke maandag sporten en er
  komt een keer fysio tussen: het enige wat Claude kon was de hele reeks
  weggooien. Nu kan `skip_occurrence` een dag uit een reeks halen (en
  terugzetten), `move_occurrence` een dag verzetten, en `update_schoolwork`
  stappen afvinken.

  `movable` liet alleen dingen zonder adres zien, waardoor sporten er niet in
  stond; nu staat erbij of iets herhalend is en of er een plek aan hangt. Een
  geweigerd blok noemt nu wat er in de weg staat en wat er wel kan.

## 0.68.0

- **"Leertijd inplannen" past het werk nu in je eigen agenda.** Het zette een
  blok neer met de hele schatting erin, op de dag voor de deadline, ook als je
  dan aan het werk was. Nu wordt het voorstel uitgerekend met je agenda erbij:
  alleen de gaten waarin je thuis bent (reistijd eraf), per open stap, opgeknipt
  in blokken van hoogstens anderhalf uur met een pauze na aaneengesloten werk,
  en met wat er al staat eraf zodat inplannen niets verdubbelt. Je ziet het
  eerst; pas op de knop staat het er.

  De kaart op Vandaag zegt nu ook hoeveel er nog moet voor de eerstvolgende
  deadline en hoeveel tijd daar tegenover staat. De rekenkant staat in
  `src/lib/planning.ts`.

## 0.67.0

- **Twee filters op Schoolwerk: op status en op prioriteit.** Met het aantal
  erbij, en de kop telt mee ("Opdrachten (2 van 23)").

  De tellingen rekenen elkaar mee: sta je op "hoog", dan zegt de statusrij
  hoeveel hoge opdrachten er te doen, bezig en klaar zijn -- niet hoeveel er in
  totaal zijn. Een knop hoort te beloven wat hij oplevert.

  Met drieentwintig opdrachten stond alles door elkaar. Sorteren zette klaar
  werk wel onderaan, maar je scrolde er nog steeds langs, en "waar was ik ook
  alweer mee bezig" was een zoekplaatje. De keuze blijft bewaard op dit
  apparaat: wie op "bezig" staat wil dat morgen meestal nog steeds.

## 0.66.0

- **De app laat nu zien welke versie hij draait**, onderaan Instellingen. Klein,
  maar het beantwoordt een vraag die je anders niet kúnt beantwoorden: draaien
  mijn telefoon en mijn laptop wel dezelfde app? Zonder dat is "het werkt bij
  mij niet" niet te onderscheiden van "dit apparaat heeft de nieuwe versie nog
  niet opgehaald".

## 0.65.0

- **Een knop "Nu synchroniseren".** Bij **Instellingen -> Account &
  synchronisatie**, met daarnaast het tijdstip waarop er voor het laatst is
  opgehaald.

  De app haalt uit zichzelf op bij openen en bij terugkomen, maar dat is niet
  hetzelfde als kunnen zien dát het gebeurt. Wie twee apparaten heeft wil
  kunnen drukken en zien dat het gelukt is -- anders blijft "sluit de app en
  open hem opnieuw" het advies, en dat is geen advies maar een omweg.

  De knop doet dezelfde ronde als bij het inloggen: ophalen, samenvoegen met
  wat hier staat, en het geheel terugschrijven. Hij slaat de wachttijd van de
  automatische verversing over.

## 0.64.0

- **Een mislukte reisberekening werd voor altijd geblokkeerd.** Dit is het
  antwoord op de vraag waarom een verouderde rit kon blijven staan. Lukte het
  ophalen van een rit één keer niet, dan ging die op een zwarte lijst -- en die
  lijst werd alleen geleegd als je opnieuw online kwam of opnieuw inlogde. Ging
  er dus iets mis terwijl je gewoon verbinding had (de routedienst die even niet
  wilde), dan bleef de oude vertrektijd staan, wat er ook veranderde.

  Nu krijgt zo'n rit na een kwartier vanzelf een nieuwe kans, en kijkt de app
  elke vijf minuten of er iets op die lijst staat te wachten. Zonder dat laatste
  gebeurde er niets zolang je agenda niet veranderde -- precies de situatie
  waarin je naar een verkeerde vertrektijd zit te kijken.

- **De botsingsmelding gebruikt nu ook de geschatte reistijd.** Was een van
  beide ritten nog niet berekend, dan gold de begintijd als vertrek, en zag de
  waarschuwing niet dat je al weg moet terwijl je nog ergens zit.

  Wat hij bewust níét meldt: dat je thuisreis over je heenreis naar de volgende
  plek valt. Daar is het antwoord "ga rechtstreeks door", en dat is iets wat de
  app apart bijhoudt -- geen botsing maar een doorreis.

## 0.63.0

- **Je vertrektijd naar werk stond op 05:42 voor een dag die om 09:00 begint.**
  Twee uur en twintig minuten te vroeg, met een reis van 54 minuten. Dezelfde
  oorzaak als bij de thuiskomst: bij een reeks wordt één berekende rit voor alle
  dagen bewaard, en verschuift je begintijd daarna, dan blijft die rit staan.
  Die was hier van een begintijd rond 07:00 -- hij zette je om 06:36 af.

  Zet een opgeslagen rit je meer dan anderhalf uur te vroeg af, dan gelooft de
  app hem niet meer en rekent gewoon: begintijd min reistijd min marge. Voor die
  werkdag: vertrek om 08:01.

  Een uur te vroeg aankomen blijft geloofd -- op een lijn die één keer per uur
  rijdt is dat gewoon de beste rit. Daar staat een test op.

## 0.62.0

- **En hetzelfde voor de heenreis.** In dezelfde controle waarin 0.61.0 groen
  bleek, stond bij "Sporten" wél een thuisreis van 20 minuten maar geen
  berekende heenreis. Dan gold de begintijd als vertrektijd, en bood de app een
  gaatje van 21 minuten aan in precies het kwartier dat je erheen fietst.

  Is een van beide reizen nog niet berekend, dan houdt de app nu de andere aan
  als schatting -- in allebei de richtingen.

## 0.61.0

- **Zonder berekende thuisreis gold je eindtijd als thuiskomst.** Gevonden door
  0.60.0 live na te lopen: bij "Werken" in Lelystad stond wel de heenreis van
  54 minuten maar nog geen thuisreis, en dus begon de vrije tijd om 17:00 -- de
  fout waar het allemaal om begonnen was, via een andere deur binnen.

  Is de thuisreis nog niet berekend, dan houdt de app nu de heenreis aan als
  schatting: thuis om 17:54, met `backHomeEstimated` erbij zodat zichtbaar is
  dat het een schatting is. Goed genoeg om op te plannen, niet goed genoeg om
  op te zweren.

- **Eén berekening in plaats van twee.** Het "van huis"-venster werd op twee
  plekken apart uitgerekend: bij het zoeken naar vrije tijd en bij het weigeren
  van een onmogelijk blok. Na de aanpassing hierboven liepen die uit de pas --
  een test ving het. Ze delen nu dezelfde functie.

- **Minder valse dubbelmeldingen.** "BE week 4 -- H4 + H5 opgaven + Casus deel
  1" en "Excel week 4 -- H5 Grafieken" werden als hetzelfde gemeld omdat ze
  "week", "4" en "h5" delen. De drempel ging van zestig naar zeventig procent:
  de echte dubbele opdracht wordt nog gezien, deze twee niet meer.

## 0.60.0

- **Twee apparaten, twee verschillende agenda's op hetzelfde account.** De
  ernstigste fout tot nu toe, want hij wiste werk.

  Het wegschrijven naar de cloud schreef de lokale agenda er botweg overheen.
  Stond je telefoon een dag open terwijl je op je laptop verder werkte, dan
  wiste één wijziging op die telefoon alles wat de laptop had toegevoegd. En
  omdat een apparaat alleen bij het openen ophaalde, bleef elk apparaat zijn
  eigen versie tonen -- ze liepen niet vast, ze liepen uit elkaar.

  Nu kijkt de app eerst wat er in de cloud staat, voegt dat samen met wat er
  lokaal is, en schrijft het resultaat weg. Wat er van het andere apparaat bij
  komt verschijnt meteen op dit scherm. Weggegooide dingen blijven weg: daar
  zijn de grafstenen voor.

- **En bij terugkomen in de app wordt er opnieuw opgehaald.** Hoogstens twee
  keer per minuut, bij terugkeren naar het tabblad of zodra je weer online
  bent. Een geïnstalleerde app blijft dagen open staan; die hoort niet nog naar
  vorige week te kijken.

## 0.59.0

- **"Hoe laat ben ik thuis" klopte niet meer bij een herhalende activiteit.**
  Bij een reeks staat er één berekende rit voor alle dagen. Die verschuift: in
  de echte agenda stond bij werken tot 17:00 een opgeslagen thuiskomst van
  15:46 -- eerder dan je klaar bent.

  De app las dat als "dan ben je pas na middernacht thuis" en maakte er een
  thuisreis van 22 uur van. Op het scherm stond nog "15:46", maar onderwater
  telde die dag als volledig bezet, en de connector gaf daardoor geen enkel
  vrij gat meer terug voor die avond.

  Zo'n rit is niet laat maar oud. Valt een geplande thuiskomst meer dan drie uur
  buiten de reisduur zelf, dan gelooft de app hem niet meer en rekent hij
  gewoon: eindtijd plus reistijd. Voor die woensdag: thuis om 17:42.

## 0.58.0

- **De connector meldt nu wat er dubbel staat.** In `duplicates` komen
  opdrachten die hetzelfde werk onder een andere naam zijn ("Excel week 2 -- H2
  (Opdracht 2.5 en 2.6)" naast "Excel week 2 -- H2 Afronden": zelfde vak,
  zelfde deadline) en blokken die op dezelfde dag twee keer hetzelfde lijken
  ("Lezen" naast "Lezen (voor het slapen)").

  Bewust alleen een signaal. Of die twee leesblokken een vergissing zijn of
  precies de bedoeling weet alleen jij; opruimen is een besluit, geen
  berekening. De connector noemt het, jij beslist.

- **En wat er botst.** Per dag staat er `clashes`: activiteiten die op de klok
  overlappen, én de stille variant waarbij alleen je reistijd over iets anders
  heen valt. Dat is dezelfde berekening die de app op je eigen scherm gebruikt.

## 0.57.0

- **De connector laat nu de dag zien zoals jij hem ziet, niet als een lijst
  rijen.** De vorige versie gaf de activiteiten door en liet het rekenwerk aan
  de planner over: zoek zelf de gaten, tel zelf de reistijd erbij, bedenk zelf
  of het past. Dat ging mis, en terecht -- de app wist het al, hij zei het
  alleen niet.

  Per dag staat er nu `free`: de gaten waarin werkelijk iets past, met de
  reistijden er al in verwerkt. Op een werkdag begint die lijst om 17:54 en niet
  om 17:00. Daarnaast `movable`: de blokken die zouden kunnen wijken als het
  krap wordt -- alleen om voor te stellen, nooit om zelf te verzetten.

- **`rules` in het antwoord.** Binnen welke uren er gepland mag worden (07:00 tot
  22:00), wat het kortste zinvolle blok is, en wat er mag wijken. De grens hoort
  bij de gebruiker, niet bij het model, dus staat hij er zichtbaar bij.

- **Per opdracht `plannedMinutes` en `remainingMinutes`.** Wat er al voor staat
  en wat er nog bij moet. Zonder die twee getallen plant een planner er elke
  keer een nieuwe stapel bovenop, want hij ziet niet dat het er al is.

## 0.56.0

- **De connector wist niet wanneer je thuis was.** `read_agenda` gaf keurig door
  hoe laat je van huis moest, maar zweeg over de reis terug. Een planner las
  "werken tot 17:00" en zette er om 17:20 een leerblok achter -- terwijl de
  terugreis uit Lelystad 54 minuten duurt en je pas om 17:54 binnenkomt. Die
  blokken bestonden alleen op papier.

  Per activiteit staat er nu `arrival` (hoe laat je er bent) en `backHome` (hoe
  laat je weer thuis bent, inclusief de reis terug) bij. Tussen `departure` en
  `backHome` ben je van huis, en daar past niets thuis tussen.

- **`save_activities` weigert nu een blok waarvoor je onderweg bent.** Een blok
  zonder eigen locatie doe je thuis; valt het in het venster waarin je van huis
  bent, dan komt het er niet in en krijgt de planner de reden terug ("je bent
  dan niet thuis: Werken loopt tot 17:54 inclusief de reis terug"). Beter een
  planning die terugpraat dan een agenda die niet klopt.

- **Twee keer dezelfde planning zet je week niet meer dubbel.** Een blok zonder
  `id` dat op dezelfde dag, dezelfde begintijd en met dezelfde titel al bestaat,
  wordt bijgewerkt in plaats van ernaast gezet.

## 0.55.0

- **Je rooster stond dubbel op je tweede apparaat.** Twee fouten die elkaar
  versterkten, en samen je hele agenda verdubbelden.

  Bij het verversen van een gekoppelde agenda werd de hele reeks vervangen: weg
  met de oude blokken, terug met nieuwe. Die nieuwe kregen een willekeurig id.
  Dezelfde les van dezelfde donderdag kreeg op je telefoon dus een ander id dan
  op je laptop, en het samenvoegen -- dat op id werkt -- zag er twee losse
  blokken in. Elke verversing op elk apparaat legde er een laag bovenop.

  Tegelijk liet dat vervangen geen grafsteen achter. Wat het ene apparaat
  weghaalde, kende het andere nog, dus bij de eerstvolgende synchronisatie kwam
  het gewoon terug -- naast het nieuwe.

  Nu leidt een blok uit een gekoppelde agenda zijn id af van de afspraak zelf
  (`feed:<agenda>:<uid>`). Op elk apparaat hetzelfde, hoe vaak er ook ververst
  wordt, dus het samenvoegen ziet er één blok in. En verdwijnt er echt iets --
  een vervallen uur, een losgekoppelde agenda -- dan legt dat nu wel een
  grafsteen neer, zodat het ook op je andere apparaat weggaat.

  Wat er al dubbel stond ruimt zichzelf op bij de eerstvolgende verversing: die
  vervangt alles van die agenda door de afgeleide ids en zet grafstenen voor de
  oude.

- **"Nu opnieuw ophalen" bij je gekoppelde rooster.** Normaal kijkt de app
  hoogstens eens per twaalf uur. Prima voor een rooster dat af en toe wijzigt,
  vervelend wanneer je nú wilt zien of het klopt -- of wanneer je niet wilt
  wachten tot de dubbele blokken vanzelf verdwijnen.

## 0.54.0

- **Alle stappen afgevinkt betekent nu ook: opdracht af.** Het stuk dat in 0.53.0
  nog ontbrak. Je werkte je zes stappen weg, het laatste hokje ging aan — en de
  opdracht bleef op "te doen" staan, want die status zette je zelf. Je agenda
  geloofde die status, en toonde de leerblokken dus nog steeds alsof er werk lag.

  Vink je het laatste hokje aan, dan gaat de opdracht op "af" en zijn alle
  gekoppelde blokken doorgestreept. Haal je er daarna weer een weg, dan springt
  hij terug op "bezig": je bent er kennelijk toch nog mee bezig. Een opdracht
  zonder stappen blijft met rust gelaten; daar is de status het enige wat we
  weten, en die zet je zelf.

  De statusknoppen blijven gewoon werken. De status is en blijft de enige
  waarheid — het afvinken zet hem alleen voor je om.

## 0.53.0

- **Een afgevinkte stap streept nu ook het blok door.** Je werkt een avond door,
  vinkt "Samenvatting H3" en "Samenvatting H4.1 t/m 4.4" af — en in je agenda
  staan die twee blokken er nog steeds bij alsof ze moeten gebeuren. De streep
  keek alleen naar de status van de héle opdracht, en die stond nog op "te doen"
  omdat er nog vier stappen open waren.

  Dat klopte niet met hoe je een opdracht van zes uur plant: niet als één blok,
  maar in stukken, en elk stuk is af op zijn eigen moment.

  Een blok is nu doorgestreept zodra de stap waar het bij hoort is afgevinkt.
  Welke stap dat is, staat bij voorkeur in het nieuwe veld `linkedStepId`. Staat
  het er niet — en bij blokken die er al stonden staat het er niet — dan wordt de
  stap herkend aan de titel: "BE – samenvatting H3" hoort bij "Samenvatting H3".

  Dat herkennen kijkt naar hele woorden, niet naar letterreeksen, dus "H3" matcht
  niet op "H30". Hoofdletters, streepjes en accenten doen niet mee. En past er
  meer dan één stap in de titel, dan wint de langste: staan er stappen "T4.1
  Gouda" en "T4.1 Gouda + T4.2 Van Dam", dan wordt een blok met die hele tweede
  naam niet doorgestreept zodra alleen het eerste deel af is.

  Nagelopen in de draaiende app met precies die opdracht: de twee afgevinkte
  blokken van dinsdagavond doorgestreept met ✓ af, de gitaarles ertussen gewoon,
  en het MC-vragenblok van woensdag onaangeroerd — in het dagoverzicht, de
  agendalijst en het weekraster.

- **De connector ziet de stappen nu ook.** `read_agenda` geeft per opdracht de
  stappen terug (met hun `id`, of ze af zijn en hoeveel tijd ze kosten), en
  `save_activities` accepteert `linkedStepId`. Zo kan een planning per stap een
  blok zetten dat vanzelf goed afstreept.

## 0.52.0

- **Claude kan nu rechtstreeks bij de agenda.** Tot nu toe ging een planning via
  een bestand: exporteren, in een gesprek plakken, het antwoord weer
  importeren. Vier handelingen per keer, en Claude zag alleen de momentopname
  in dat bestand.

  De app biedt nu één adres aan, `/api/mcp`, dat het Model Context Protocol
  spreekt. Je maakt in **Instellingen → Claude-connector** een sleutel aan,
  plakt adres en sleutel in Claude onder *Connectors → Aangepaste connector
  toevoegen*, en daarna vraag je gewoon om een planning.

  Drie gereedschappen, bewust niet meer:

  | Gereedschap | Wat het doet |
  | --- | --- |
  | `read_agenda` | De agenda over een periode, herhalingen al uitgerekend tot losse dagen, met vertrektijd en reisduur per activiteit. Plus het open huiswerk en de komende toetsen. |
  | `save_activities` | Blokken toevoegen of wijzigen. Zonder `id` komt er een blok bij; met een bestaand `id` vervangt het dat blok — zo verplaats je iets. |
  | `delete_activities` | Blokken weghalen op hun `id`, met een grafsteen zodat ze niet terugkomen bij de volgende sync. |

  Wat de connector **niet** mag: huiswerk afvinken, instellingen aanpassen, aan
  je account komen. En hij kijkt nooit uit zichzelf mee — er gebeurt alleen iets
  wanneer jij in een gesprek iets vraagt.

  De vertrektijd die de planner ziet is dezelfde som die de app op het scherm
  zet (`computeDeparture`), niet een tweede berekening die er na een half jaar
  naast ligt. Datzelfde geldt voor het opslaan: dat gaat door
  `normalizeActivity`, precies zoals de import.

- **Van de sleutel staat alleen een hash in de database.** De leesbare vorm
  bestaat één keer, op het scherm waar je hem aanmaakt. Raakt die tabel op
  straat, dan ligt daarmee niemands agenda open — en het verklaart ook waarom we
  hem niet nog eens kunnen tonen. Kwijt is geen ramp: maak een nieuwe en trek de
  oude in.

- **Aanzetten vergt één SQL-bestand.** [`supabase/connector.sql`](supabase/connector.sql)
  in de SQL-editor draaien; verder zijn er geen instellingen. Stap 10 van
  [`SUPABASE-SETUP.md`](SUPABASE-SETUP.md) loopt het na.

## 0.51.0

- **Een overstap van twee minuten voor 196 meter.** Bij Lelystad Centrum staat
  er 196 meter tussen het perron en het busstation, en de dienstregeling geeft
  daar twee minuten voor: 5,9 km/h. Dat is sneller dan de 5,04 waarmee deze app
  élk ander loopstuk narekent, dus beloofden we een aansluiting die je alleen
  haalt als je rent en de trein op tijd is. 9292 rekent er drie minuten voor en
  biedt die bus niet aan.

  De app vraagt de planner nu één minuut extra voor elke overstap
  (`additionalTransferTime`). Nagemeten tegen drie echte 9292-schermen van
  maandag 14 september, de rit van huis naar school om 07:00:

  | | vertrek → aankomst | bus |
  | --- | --- | --- |
  | zonder die minuut | 07:12 → 07:52 | 207 van 07:35 naar Palazzo |
  | met die minuut | 07:12 → 08:06 | 6 van 07:50 naar Zwartezeestraat |
  | 9292 | 07:12 → 08:01 | 16 van 07:36 naar Zwartezeestraat |

  Zonder die minuut kwamen we negen minuten eerder aan dan 9292 zegt, op een
  overstap die 9292 niet aanbiedt. Met die minuut komen we bij dezelfde halte
  uit, maar op een latere bus: 9292 stapt op een bus die vertrekt op precies de
  minuut waarop je aankomt, en dat laat de planner niet toe. Eén bus verschil,
  aan de veilige kant. Voor het advies dat de agenda geeft maakt het op deze rit
  niets uit: om uiterlijk 08:20 op school te zijn zegt elk van de drie
  "vertrek 07:12".

  Wat het kost, over 40 vergelijkingen: 32 keer dezelfde aankomst, 8 keer later
  (samen 38 minuten, hoogste 10), 0 keer eerder. Die acht zijn precies de ritten
  die op zo'n krappe overstap leunden. Na te meten met
  `node scripts/krappe-overstap.mjs`; over 48 ritten zat er in 19 een overstap
  die krapper was dan onze eigen loopsnelheid.

## 0.50.0

- **"Je komt te laat" stond er nooit bij een doorreis.** Ga je van school
  rechtstreeks door naar training, dan rekent de app die rit uit en zet erbij
  hoe laat je aankomt. Of dat te laat is, wist hij ook — alleen kreeg
  `computeOnward` op de kaarten steeds `null` mee als starttijd van waar je heen
  gaat, en dan kán die vlag niet waar worden. Op drie plekken (de dagkaart, de
  kaart van je eerstvolgende activiteit en het weekraster) stond die
  waarschuwing dus in de code maar kwam hij nooit in beeld, terwijl het
  dagoverzicht hem wél toonde: twee schermen over dezelfde dag, met een ander
  antwoord.

  Ze halen die bestemming nu alle drie op met dezelfde regel als het
  dagoverzicht (`onwardTarget`). School tot 15:00, 24 minuten rijden, training
  om 15:15: er staat nu "om 15:24 daar · je komt te laat".

- **Twee dingen tegelijk in je agenda werden nergens benoemd.** Je agenda wordt
  niet alleen door jou gevuld: een leerplan, een gekoppeld rooster en een
  geabonneerde agenda schrijven er alle drie in. In het weekraster zie je twee
  blokken dan naast elkaar staan, maar in een lijst valt het niet op — en dan
  kom je erachter als je er al zit.

  Er staat nu een regel bij: "⚠️ Staat tegelijk met Bijles wiskunde (14:00 –
  15:30)". En voor de stille variant, waarbij de activiteiten zelf niet
  overlappen maar je reistijd eroverheen valt: "⚠️ Je reistijd valt over
  Training (15:15 – 16:30)" — je moet weg terwijl het andere nog bezig is.

  Geen foutmelding en niets dat je tegenhoudt: soms boek je met opzet dubbel.
  Aansluitend telt niet mee (om 15:00 uit en om 15:00 verder is precies wat een
  schooldag doet), en iets dat de hele dag duurt evenmin: "herfstvakantie" botst
  met niets. Gaat het om de plek waar je rechtstreeks heen reist, dan blijft de
  waarschuwing weg: die staat al bij de doorreis, mét de tijd waarop je aankomt.

## 0.49.0

- **Werk dat af is, staat nu doorgestreept in je agenda.** Vink je een opdracht
  of toets af op Schoolwerk, dan blijven de leerblokken die eraan gekoppeld zijn
  gewoon in je agenda staan — en dat hoort ook, je wilt kunnen zien waar je tijd
  heen ging. Maar er viel nergens aan te zien dat er niets meer te doen viel: om
  acht uur vanavond stond er "Wiskunde leren" alsof je nog moest beginnen.

  Nu staat de titel doorgestreept met een groen ✓ af erbij, in elke weergave:
  de dagkaarten, het dagoverzicht, het weekraster, het maandraster en de kaart
  van je eerstvolgende activiteit. Op het dashboard staat er bovendien bij
  hoeveel van je geplande leertijd vandaag al af is — "3 u 15 min leren gepland
  (3 blokken) · waarvan 2 u 15 min al af" — want dat is de vraag die je 's
  ochtends stelt: moet ik vanavond nog achter mijn bureau, of is die tijd vrij.

  Een leerblok zonder koppeling (los uit een leerplan) blijft zoals het was:
  daar weet de app niet van of het werk gedaan is, en dan iets doorstrepen zou
  een belofte zijn die hij niet waarmaakt. Hetzelfde geldt voor een blok
  waarvan de taak is verwijderd.

## 0.48.0

- **De vertrektijd van gisteravond bleef staan.** Een OV-rit werd bewaard onder
  een sleutel die zegt *welke* rit je zoekt: van hier naar daar, uiterlijk
  aankomen om. Klopte die sleutel nog, dan gold de opgeslagen uitkomst als
  exact en werd er niets meer opgehaald. Vertragingen, uitval en een gewijzigde
  dienstregeling komen ná de berekening binnen en veranderen die sleutel niet.

  Dus stond de vertrektijd die gisteravond werd uitgerekend er vanochtend nog,
  met "op tijd · live" eronder, terwijl je trein een kwartier later reed of
  helemaal niet. Juist de eerstvolgende activiteit — de enige waar je echt op
  afgaat — raakte zo nooit ververst: voor die dag klopte de sleutel immers.

  Nagelopen in de browser met een rit die zes weken eerder was uitgerekend, drie
  kwartier voor de start: nul aanvragen, en de onzin uit de opslag gewoon op de
  kaart. Nu telt binnen het verversvenster (vanaf drie uur voor de start tot het
  einde) ook de ouderdom mee: is wat we laten zien ouder dan twee minuten, dan
  gaat het opnieuw. Daarbuiten verandert er niets — een rit van volgende week
  hoeft niet om de twee minuten opnieuw.

  Daarbij hoort dat `computedAt` nu het moment van ophalen is en niet van
  binnenkomen. Kwam een uitkomst uit de cache van deze sessie, dan werd hij
  gestempeld alsof hij vers was, en stelde hij het volgende verversen telkens
  opnieuw uit.

- **"Vertrektijd is verstreken" en verder niets.** Je sliep uit, of je zag de
  bus wegrijden. De kaart bleef de rit tonen die je net gemist hebt — de enige
  rit op het scherm die zeker niet meer gaat — met daaronder de mededeling dat
  je te laat bent. Precies op dat moment wil je één ding weten: gaat er nog
  iets, en red ik het nog.

  Er staat nu bij wat er nog wél rijdt: `🚆 Volgende rit: 14:41 → 15:24 · 3 min
  te laat`, of "nog op tijd" als je het haalt. Rijdt er vandaag niets meer dat
  je er op tijd brengt, dan staat dat er. Alleen bij OV, alleen vandaag en
  alleen zolang je activiteit nog moet beginnen: een auto vertrekt wanneer jij
  wilt, en aan morgen is niets gemist.

- **De overstapboete nagemeten** (geen wijziging). De agenda kiest de laatste
  vertrektijd die je starttijd haalt, maar telt elke overstap als vijf minuten
  later vertrekken. Die weging stond er zonder cijfers bij. Over 48
  vergelijkingen koos hij 43 keer dezelfde rit; in de 5 gevallen dat het
  scheelde ging je samen 9 minuten eerder de deur uit en had je er telkens een
  overstap minder voor terug. Het duurste geval was drie minuten. Dat is de ruil
  die de boete hoort te maken, dus hij blijft staan — nu met de meting erbij in
  `src/lib/itineraries.ts` en na te rekenen met
  `node scripts/overstapboete.mjs`.

## 0.47.0

- **De instellingenpagina was te druk.** Elf onderdelen stonden allemaal open
  onder elkaar: op een telefoon bijna zes schermen scrollen langs 35 knoppen en
  invulvelden om te zien wat er eigenlijk stond ingesteld. Nu staan ze in vier
  groepen (Reizen, Agenda, Weergave, Account en gegevens) als rijen die
  dichtgeklapt beginnen — 1,8 scherm, 10 bedienbare dingen in beeld.

  Onder elke titel staat wat er nu is ingesteld, zodat je het antwoord meestal
  al kunt lezen zonder ergens op te klikken: je thuisadres en je marge, hoeveel
  locaties je bewaard hebt, of de meldingen aanstaan en met hoeveel minuten, of
  het rooster gekoppeld is, in welke taal en welke kleur. Dat was precies wat er
  ontbrak: alles stond open, maar niets stond er *samengevat*.

  Twee dingen blijven opvallen. Is je thuisadres nog niet ingevuld, dan staat
  die rij meteen open en de regel eronder in het rood — zonder thuisadres rekent
  de app geen enkele vertrektijd uit. En herinneringen staan nu onder Reizen en
  niet onder Agenda: het is het aantal minuten vóór je vertrektijd.

  Een dichtgeklapte rij blijft in de pagina staan en wordt alleen verborgen, dus
  een half ingetypte agenda-link ben je niet kwijt als je hem even dichtdoet.
  Met de tab-toets bereik je alleen wat openstaat, en de focusring ligt nu net
  binnen de rand van de kaart in plaats van eronder afgesneden te worden.

## 0.46.0

- **Eén activiteit met rommel erin sloopte de hele app.** Het uitwisselformaat
  wordt door de planner geschreven, niet door deze app, en er werd alleen
  gecontroleerd of een veld een string was — niet of het ergens op sloeg. Drie
  gevallen legden alles plat, tot en met de instellingenpagina:

  | wat er stond | wat er gebeurde |
  | --- | --- |
  | `recurrence: { freq: "weekly" }` zonder weekdagen | `weekdays.includes` op niets |
  | `startTime: "banaan"` | `NaN` → `Invalid time value` |
  | `location: { label: "Ergens" }` zonder coordinaten | `lat.toFixed` op niets |

  Datums en tijden worden nu op hun vorm gecontroleerd (`isDateKey`,
  `isTimeKey`) in plaats van alleen op hun type. 31 februari valt daar ook
  onder: `new Date` schuift die stilletjes door naar maart, en dan staat je
  activiteit op een dag die je niet gekozen hebt.

  Een kapotte herhaling wordt gerepareerd in plaats van weggegooid: ontbreken
  de weekdagen, dan wordt het de weekdag van de startdatum — net als wanneer je
  herhaling zelf aanzet. Een onbekend patroon wordt wekelijks. Er niets van
  maken zou de activiteit uit elke volgende week laten verdwijnen, en dat is
  precies wat deze app niet mag doen.

- **Wat uit de opslag komt gaat door dezelfde controle als een importbestand.**
  Dat was niet zo, en daar zat het venijn: de import repareerde netjes, maar
  bij de volgende keer openen kwam dezelfde rommel ongefilterd uit
  localStorage. Het foutscherm bleef dan staan bij elke keer openen, want de
  rommel bleef in de opslag. Nu gaan alle drie de ingangen — import, cloud en
  opslag — door `normalizeActivity`, `normalizeTask` en `normalizeExam`.

## 0.45.0

- **De snelste rit, in plaats van een geloofwaardige omweg.** De app liet de
  planner elke overstap uitlopen over de straat (`useRoutedTransfers`) in
  plaats van de overstaptijd te gebruiken die bij de dienstregeling zit. Dat
  stond er met een reden — vaste looppaden zouden ontbreken — maar het loopt
  over dezelfde kaart die te traag rekent. Een overstap die je in het echt
  haalt zag er dan te krap uit, en dan pakte de planner een latere trein.

  Nagemeten over 48 vergelijkingen (12 ritten op 4 tijdstippen, van elke stand
  de vroegste aankomst):

  | | |
  | --- | --- |
  | gelijk | 28 |
  | overstaptijd uit de dienstregeling sneller | 20 (samen 106 min) |
  | over de straat berekend sneller | **0** |

  Nul keer. Haarlem → Utrecht scheelde 21 minuten, Almere → Utrecht 12,
  Amsterdam → Rotterdam 6. En de rit waar dat oude comment over ging — Almere
  naar de Voorbeeldweg, met de overstap van het perron in Lelystad Centrum naar
  de bushalte ernaast — geeft op zes tijdstippen exact dezelfde rit in beide
  standen. Die vlieger ging dus niet meer op.

  Na te meten met `node scripts/overstap-vergelijking.mjs`.

  Twee andere knoppen bleken al goed te staan, en dat staat nu bij de code
  zodat niemand het nog eens hoeft uit te zoeken: meer opties opvragen (8 in
  plaats van 3) gaf over 30 ritten geen enkele keer een latere vertrektijd, en
  verder mogen lopen naar de halte (35 minuten in plaats van 20) evenmin.

## 0.44.0

- **De looptijden kloppen nu met 9292, op elke reis.** De planner geeft per
  loopstuk een afstand en een tijd, maar die tijd is niet de afstand gedeeld
  door de loopsnelheid die we meesturen: er zit straftijd in uit de
  kaartgegevens voor oversteken, stoplichten, trappen en hoogteverschil. Over
  tien ritten gemeten kwam dat neer op 4,6 km/h terwijl we om 5,04 vragen, en
  bij een kapot stuk kaart (Lelystad Palazzo) op 1,2 km/h.

  9292 doet dat niet: daar is een loopstuk de afstand gedeeld door je
  loopsnelheid. De app doet dat nu ook, voor élk loopstuk in plaats van alleen
  het laatste (`src/lib/walkTimes.ts`, was `finalWalk.ts`). Welk uiteinde van
  een loopstuk blijft staan, ligt vast door wat er niet op je wacht: het stuk
  naar de eerste halte eindigt bij de trein, dus je gaat later de deur uit; elk
  ander stuk begint als je uitstapt, dus je bent eerder waar je wezen moet. Een
  kortere overstap levert daarom wachttijd op en geen tijdwinst.

  De marge die je wilt hebben staat los in je instellingen (standaard tien
  minuten). Die hoort daar — zichtbaar en zelf te kiezen — en niet verstopt als
  een vaste minuut in elk loopstuk, want zo telde hij dubbel.

  Wat dat scheelt op de rit uit Almere naar de Voorbeeldweg in Lelystad: 53 → 42
  minuten. 9292 zegt 40. Die laatste twee minuten zijn de 223 meter omweg die in
  [`KAARTFOUTEN.md`](KAARTFOUTEN.md) staat — het verschil met 9292 zit daarmee
  helemaal in de kaart en niet meer in ons model.

- **De minuten kloppen nu met de tijden die eronder staan.** De planner geeft
  soms een duur die niet gelijk is aan zijn eigen vertrek- en aankomsttijd: 551
  meter lopen is bij hem 406 seconden, maar als tijden 18:30 → 18:36. Namen we
  dan zijn getal, dan stond er "7 min reizen · thuis om 20:36" en klopte de som
  niet. De klok wint nu — daar plan je op.

## 0.43.0

- **Onze reistijden naast die van Google leggen.**
  `GOOGLE_MAPS_API_KEY=... node scripts/vergelijk-google.mjs` draait hetzelfde
  rijtje ritten door onze planner én door Google Maps, en zet ze per rit naast
  elkaar: totale reistijd, meters lopen, minuten lopen en welke lijnen.

  Waarom Google en niet 9292: de OV-gegevens komen bij allebei uit dezelfde
  landelijke feed, dus de treinen en bussen horen exact gelijk te zijn. De
  looproutes komen wél uit verschillende kaarten — bij ons OpenStreetMap, bij
  Google hun eigen. Juist daar zat het verschil met 9292. Een vaste plus of min
  over alle ritten wijst dan op iets in ons model; losse uitschieters op een
  plek in de kaart.

  De sleutel komt uit de omgeving, staat nooit in de code en komt ook niet in de
  uitvoer terecht. De app zelf raakt Google niet aan en heeft de sleutel nooit
  nodig.

## 0.42.0

- **Meetinstrument om onze loopstukken naast 9292 te leggen.**
  `node scripts/loop-vergelijking.mjs` draait een rijtje ritten door heel
  Nederland en drukt per loopstuk de meters en de minuten af — precies de
  getallen die ook in een 9292-schermafbeelding staan, zodat je ze naast elkaar
  kunt leggen zonder te tellen. Met twee argumenten doet hij één eigen rit.

  De eerste meting: over 8 ritten en 22 loopstukken loopt de app gemiddeld
  4,4 km/h, met het gros tussen 4,6 en 4,9. 9292 rekent blijkens zijn eigen
  schermen met ongeveer 4,1. Onze loopstukken zijn dus gemiddeld eerder sneller
  dan die van 9292, niet trager. De 3,1 km/h bij halte Palazzo in Lelystad —
  waar dit mee begon — was een uitzondering, en die wordt sinds 0.34.0 al
  automatisch rechtgezet.

## 0.41.0

- **Waarom onze tijden een minuut langer zijn dan die van 9292 staat nu
  opgeschreven.** Op de rit naar de Voorbeeldweg in Lelystad loopt de app 916
  meter vanaf halte Palazzo, 9292 loopt er 693. Dat is geen rekenfout meer maar
  een verschil in de looproute die uit OpenStreetMap komt, en dat kan de app niet
  zelf rechtzetten: een kortere route verzinnen is precies wat deze app niet
  hoort te doen. Alle metingen staan in [`KAARTFOUTEN.md`](KAARTFOUTEN.md), met
  de OSM-nodes erbij en de commando's om het na te meten, zodat het te melden of
  zelf te herstellen is.

## 0.40.0

- **Op een telefoon kon je een wijziging niet opslaan.** Open je een bestaande
  activiteit, dan staan er vier knoppen onderaan: Verwijderen, Dupliceren,
  Annuleren en Opslaan. Die pasten niet naast elkaar, en juist de laatste twee
  vielen buiten het scherm — op een gewone telefoon van 390 pixels net zo goed
  als op een smalle van 320. Je kon je aanpassing dus wel maken maar niet
  bewaren. Hetzelfde gold voor het bewerken van een opdracht bij Schoolwerk,
  waar "Opslaan" van het scherm af viel. Beide knoppenrijen zakken nu netjes
  door naar een tweede regel.

## 0.39.0

- **De app zegt het nu wanneer je het niet haalt.** Rijdt er niets dat je op
  tijd afzet, dan toont de app de eerstvolgende rit daarna — dat is beter dan
  een leeg vak. Alleen stond er niet bij dat je daarmee te laat bent. Je volgde
  een keurige vertrektijd op en kwam alsnog te laat, terwijl de app het allang
  wist. Bij de vertrektijd staat nu "⚠️ je bent er pas om 09:32", op je
  beginscherm, in de agenda en in het dagoverzicht. Bij een doorreis naar een
  volgende afspraak stond zo'n waarschuwing al; de heenreis had hem niet.

- **Leertijd na middernacht telde als nul.** Een leerblok van 23:00 tot 00:30
  eindigt op de klok vóór het begint, en dat werd nul minuten. Je taak bleef op
  "ingepland: 0 min" staan terwijl je er anderhalf uur voor had uitgetrokken.

## 0.38.0

- **Met een gekoppeld rooster liep de app tegen zijn eigen limiet aan.** Een
  semester aan lesuren (bijna 500 activiteiten) betekende bij het opstarten
  461 aanvragen ineens, waarvan er 446 werden geweigerd door de
  verkeersdrempel die de gratis OV-dienst moet beschermen. Resultaat: een
  scherm vol lege vertrektijden en acht seconden wachten.

  De app rekent nu uit zichzelf alleen de komende week door — vandaag, morgen
  en het weekoverzicht, precies waar de app voor is. Dat is 47 aanvragen in
  plaats van 461, en geen enkele die stukloopt. Kijk je naar een dag die
  verder weg ligt, dan wordt die rit alsnog opgehaald op het moment dat je
  hem bekijkt. De dichtstbijzijnde dag gaat bovendien eerst, zodat bij drukte
  de verste dag sneuvelt en niet die van morgenochtend.

- **"Controleer je internetverbinding" stond er ook als het aan de andere
  kant lag.** Is de kaarten- of reisdienst zelf even onbereikbaar, dan is er
  met jouw wifi niets mis; die melding stuurde je het verkeerde bos in. Nu
  zegt hij wat er aan de hand is.

- **Het formulier pakte de focus niet.** Wie met een toetsenbord of
  schermlezer werkt, bleef achter op de knop eronder en moest eerst door de
  hele pagina heen tabben om bij "Naam" te komen.

- **Het verborgen bestandsveld bij Importeren** werd door een schermlezer
  aangekondigd als naamloos invoerveld, en je kon er met de tab-toets in
  belanden zonder het te zien. De knop ernaast is de bediening; het veld is
  nu overgeslagen.

## 0.37.0

- **Zonder bereik stond er "Failed to fetch" op je beginscherm.** De tekst van
  de browser, in het Engels, precies op de plek waar je vertrektijd hoort te
  staan. Nu staat er wat er aan de hand is: geen verbinding, en de app rekent
  het opnieuw uit zodra je weer bereik hebt.

- **En dat doet hij nu ook echt.** Een mislukte berekening werd onthouden en
  nooit meer vanzelf geprobeerd — je moest de app aanraken. Kom je weer online,
  dan pakt hij het zelf op. Handig in de trein: even door een tunnel en je
  vertrektijd staat er tien seconden later gewoon weer.

- **Een importbestand met rommel in de instellingen sloopte je beginscherm.**
  Activiteiten, taken en toetsen werden bij import zorgvuldig nagelopen, de
  instellingen niet. `bufferMinutes: "veel"` gaf geen foutmelding maar
  `NaN:NaN` als vertrektijd, en een vervoermiddel dat niet bestaat liet elke
  reisberekening stuklopen. Die gaan nu door dezelfde zeef: wat klopt blijft
  staan, wat niet klopt valt terug op de standaard, en een veld dat niet in het
  bestand staat blijft ook hier weg.

- **Twee foutmeldingen bij import waren altijd Nederlands**, ook in de Engelse
  app: die over een bestand van een andere app, en die over een onbekende
  bestandsversie.

## 0.36.0

Verder gezocht met vreemde gegevens: een dienst die over middernacht heen loopt,
een type dat de app niet kent, drie activiteiten tegelijk, een adres van vier
regels lang. Het meeste hield stand; dit niet.

- **Een nachtdienst stond nergens en was toch al "geweest".** Iets van 23:00 tot
  01:00 eindigt op de kalender vóór het begint. Het weekraster liet zo'n blok
  daardoor buiten beeld vallen, en in het dagoverzicht stond je nachtdienst al
  om negen uur 's ochtends afgevinkt. Allebei kloppen ze nu: het raster loopt
  door tot voorbij het laatste begin, en "geweest" begint pas als de dienst
  echt om is.

- **Een onbekend type deed zich voor als School.** Gooide je een eigen type weg
  terwijl er nog activiteiten op stonden, of kwam er een agenda binnen met
  `"sport"` in plaats van `"gym"`, dan werd dat stil een schooldag: blauw, met
  het schoolgebouwtje ervoor. Nu staat het type er gewoon zoals het is, in
  grijs, zodat je ziet dat er iets niet klopt. De [README](README.md) noemt nu
  ook welke waarden `category` kan hebben.

- **De legenda onder het weekraster zei "🚗 heen"**, ook bij een treinreis. Hij
  wijst nu naar het icoontje op het blok zelf, dat sinds 0.35.0 bij de rit hoort.

## 0.35.0

Een ronde door de app op een telefoon en op een laptop, scherm voor scherm.
Wat daar uitkwam had één ding gemeen: op hetzelfde scherm stonden twee
verschillende antwoorden op dezelfde vraag.

- **'s Avonds klopte je dagoverzicht niet meer.** De kaart bovenaan zei "vertrek
  om 07:12, 54 minuten reizen"; het dagoverzicht eronder zei "1 u 55 min reizen"
  en "2 u 43 min". Dat kwam doordat de app de rit van vanochtend nog aan de
  planner vroeg, en die heeft van een tijdstip dat voorbij is geen
  dienstregeling meer. Wat je terugkreeg was geen foutmelding maar een
  geloofwaardige omweg: Almere naar Lelystad via Zeewolde en Harderwijk, zes
  bussen, twee uur — terwijl de trein er elf minuten over doet.

  De app vraagt nu geen ritten meer op die al gereden zijn. Bij een reeks
  ("elke werkdag naar school") schuift hij door naar de eerstvolgende keer die
  nog moet komen, zodra die van vandaag voorbij is.

- **Hoe laat je thuis bent, stond er twee keer verschillend.** De kaart rekende
  met de rit die je echt neemt (bus van 15:02, thuis om 15:46), het
  dagoverzicht met eindtijd plus reisduur (15:44). Nu rekenen ze allebei met de
  echte rit.

- **"Op tijd · live" stond ook bij tijden van een andere dag.** Kijk je vooruit
  naar donderdag, dan zijn de getoonde tijden die van de eerstvolgende dag die
  al berekend is — dat staat er ook bij. Maar het groene "live" ging over de
  trein van die andere dag. Dat vinkje verschijnt nu alleen nog bij tijden van
  de dag zelf.

- **Op de reisplanner lag "Zoek reis" achter de knop "Activiteit toevoegen".**
  Op een telefoon stak hij er net bovenuit; je moest scrollen om te kunnen
  zoeken, met een knop in beeld die iets heel anders doet. De zwevende knop is
  daar weg — die pagina heeft zijn eigen hoofdknop.

- **In het weekraster stond een auto boven een treinreis.** Dat icoontje lag
  vast op de auto, ook bij een schooldag waar je met de trein heen gaat. Nu
  hoort het bij het vervoermiddel van de rit.

## 0.34.0

- **De agenda kiest nu zelf welke rit erbij hoort.** Bij "uiterlijk aankomen
  om" vroeg de app de planner om precies één rit. Die geeft dan de laatste
  vertrektijd die het haalt, en dat mag van hem ook een rit zijn die alle
  speling opmaakt. Almere Buiten naar Lelystad, uiterlijk half negen: je moet
  om 07:12 weg — dat klopte — maar de rit die je erbij zag wachtte een half uur
  op het busstation en zette je om 08:29 voor de deur, één minuut voor tijd,
  terwijl je met diezelfde trein en een andere bus om 08:06 binnen bent.

  De app vraagt nu een paar opties op en kiest er zelf uit, met de regels die
  daar al voor klaarlagen: zo laat mogelijk de deur uit, en bij een gelijke
  vertrektijd de kortste rit. De vertrektijd blijft dus dezelfde, maar de reis
  eronder is de reis die je echt maakt. Op deze route scheelt dat 23 minuten
  aan verzonnen wachttijd (77 minuten werd 54).

- **Het laatste stukje lopen rekent de app zelf na.** De planner rekende dat
  soms veel trager dan welke loopsnelheid ook. Van de halte Palazzo naar de
  Voorbeeldweg in Lelystad is het 916 meter, en daar zette hij 18 minuten voor —
  3,1 km/h. Dat is geen loopsnelheid maar een vaste straftijd in zijn
  kaartgegevens: de eerste 211 meter, door de Torenvalktunnel, rekent hij op
  tien minuten, en dat blijft zo wat je ook instelt (zonder instelling 20
  minuten, op 5 km/h 18, op 7,2 km/h nog altijd 15).

  Loopt de planner op het laatste stuk meer dan 40% achter op jouw tempo, dan
  rekent de app het zelf uit afstand en loopsnelheid, met een minuut extra voor
  oversteken. Die 18 minuten worden zo 12, en de rit van 06:42 naar Lelystad
  staat nu op 41 minuten in plaats van 47.

  Bewust alleen het láátste loopstuk. Dat kan je hooguit eerder thuisbrengen;
  minuten afhalen van het stuk naar de eerste halte of van een overstap zou
  betekenen dat je later de deur uit moet en je trein mist. Een loopstuk dat
  gewoon klopt blijft staan, en wie "rustig" loopt houdt de tijden van de
  planner.

- **De keuze rustig / normaal / stevig is weg.** De app rekent voortaan altijd
  met 5 km/h. Die knop kwam er in 0.32.0 omdat de planner uit zichzelf
  voorzichtiger rekent, maar niemand gaat een loopsnelheid instellen om zijn
  vertrektijd te laten kloppen — en met drie standen gaf de app drie
  verschillende antwoorden op dezelfde vraag. Wie wat extra tijd wil, heeft
  daar de veiligheidsmarge voor. De instelling verdwijnt uit Instellingen; een
  eerder gemaakte keuze wordt genegeerd en verandert niets aan je gegevens.

- **De afstand van een OV-reis klopt weer.** Die telde alleen de loopstukken
  mee, want de planner zet bij een trein of bus geen afstand in zijn antwoord —
  alleen de getekende route. Een rit van 22 kilometer stond zo als 1,8
  kilometer in je back-up. De app meet die tekening nu zelf op.

- **Lopen naar iets wat ver weg is zei "geen looproute gevonden".** Dat klopte
  niet: de route bestond wel, maar duurde langer dan de vier uur die de app
  aan een directe route toestond — Almere Buiten naar Lelystad is 19,5
  kilometer, oftewel 4 uur en 18 minuten. Die grens staat voor lopen nu op acht
  uur, en is het écht te ver, dan zegt de app dat ook zo.

## 0.33.0

- **Stevig doorlopen is nu de standaard.** In 0.32.0 kon je de loopsnelheid
  kiezen, met "normaal" (de voorzichtige 4 km/h van de planner) als startpunt.
  Dat betekende dat je er eerst zelf achter moest komen dat die knop bestond
  voordat je reistijden gingen kloppen met wat je gewend bent van 9292.

  De app gaat nu uit van 5 km/h, dezelfde aanname als 9292, voor iedereen die
  niets kiest. Wie rustiger loopt zet het in Instellingen terug op normaal of
  rustig; die keuze blijft staan.

## 0.32.0

- **Loopsnelheid instelbaar, zoals 9292 dat ook heeft.** De planner rekent uit
  zichzelf met ongeveer 4 km/h; 9292 gaat uit van 5 km/h. Op een reis met drie
  loopstukken — naar de halte, de overstap, en het laatste stuk naar de deur —
  loopt dat verschil op tot zo'n tien minuten, zonder dat er iets fout gaat en
  zonder dat je er iets over kon zeggen.

  In Instellingen staat nu "Loopsnelheid": rustig (3 km/h), normaal (de
  snelheid van de planner zelf) of stevig (5 km/h, waar 9292 mee rekent). De
  keuze gaat als `pedestrianSpeed` mee naar de planner en geldt voor elk
  loopstuk, ook bij een route die helemaal lopend is.

  "Normaal" stuurt bewust niets mee: wie niets verandert houdt exact dezelfde
  tijden als voorheen. De snelheid staat wel in de sleutel van een berekende
  reis, zodat het omzetten meteen alles opnieuw laat berekenen in plaats van de
  oude, langzamere uitkomst te blijven tonen.

## 0.31.0

- **Een bewaarde plek een beter adres geven, zonder de rest opnieuw te doen.**
  Bij je bewaarde plekken staat nu "Adres wijzigen". Kies je daar een nieuw
  adres, dan verhuist alles mee wat op het oude punt stond: de plek zelf, je
  rooster, je agenda-abonnementen en elke activiteit die er al stond. Hun
  opgeslagen reistijd vervalt en wordt opnieuw berekend.

  Dat laatste was namelijk de stille fout eronder. Een bewaarde plek is geen
  verwijzing maar een kopie: bij het toevoegen van een activiteit gaan de
  coordinaten mee. Verbeterde je later het adres van de plek, dan bleven al je
  bestaande activiteiten naar het oude punt reizen — en daar zag je niets van.
  Precies het geval uit 0.30.0: een punt zonder straatnaam dat honderden meters
  naast de voordeur ligt, weggooien en opnieuw kiezen hielp alleen voor wat je
  daarna aanmaakte.

- **De waarschuwing bij een adres zonder straatnaam wijst nu naar die knop**
  in plaats van naar "gooi hem weg en begin opnieuw".

## 0.30.0

- **Adressen komen nu uit het Nederlandse adressenregister.** De app zocht
  adressen op in OpenStreetMap, en dat kent lang niet elk huisnummer. Wat je dan
  terugkrijgt is het dichtstbijzijnde punt dat er wél in staat — en dat kan
  honderden meters verderop liggen. De app rekent daar netjes een looproute
  naartoe, dus je ziet geen foutmelding, alleen een reistijd die nergens uit
  blijkt.

  Concreet geval: een rit van Almere naar Lelystad duurde 52 minuten waar 9292
  er 42 gaf. Zelfde trein, zelfde bus, zelfde overstap van drie minuten — maar
  het laatste stukje lopen was 20 minuten in plaats van 11. Bij de loopsnelheid
  die de planner aanhoudt (die klopte, want de overstap van 206 meter duurde in
  beide precies drie minuten) hoort daar een afstand van 1,4 kilometer bij, twee
  keer zo ver als de 693 meter die het werkelijk is. De bestemming lag dus zo'n
  zevenhonderd meter naast de voordeur. Herkenbaar aan de naam: die heette
  "184, Lelystad", zonder straatnaam.

  Voortaan gaat elke adreszoekopdracht eerst langs de BAG via PDOK — gratis,
  zonder sleutel, en de bron waar elk Nederlands adres in staat met de
  coordinaten van het pand zelf. OpenStreetMap blijft er voor alles wat geen
  Nederlands huisadres is: een sportschool op naam, een station over de grens,
  een gebouw zonder huisnummer. Levert het register niets op, dan valt de app
  daar vanzelf op terug.

  **Let op:** locaties die je eerder hebt opgeslagen — je thuisadres, je vaste
  plekken — houden hun oude coordinaten. Kies ze één keer opnieuw om ook daar
  het exacte punt te krijgen.

- **Bij elk loop- en fietsonderdeel staat nu de afstand** ("20 min · 1,4 km").
  Alleen een tijd verbergt een omweg; met de meters ernaast zie je meteen of er
  iets niet klopt.

- **De straatnaam blijft in de zoeksuggestie staan**, ook als de adresgegevens
  hem missen. Een bestemming die "184, Lelystad" heet is een zwakke match, en
  dat hoor je te kunnen zien voordat je hem kiest.

- **De app zegt het nu wanneer een adres zijn straatnaam mist.** Dat was de
  stille fout achter alles hierboven: "60, Almere" en "184, Lelystad" zijn geen
  adressen maar losse punten die de zoeker niet aan een straat kon koppelen, en
  zo'n punt kan honderden meters van de bedoelde voordeur liggen. De app rekende
  daar keurig een looproute naartoe en gaf een reistijd die nergens uit bleek.
  Nu staat er een waarschuwing — in het adresveld zelf en bij je bewaarde
  plekken — met wat je eraan doet. Al opgeslagen locaties houden hun oude punt
  tot je ze opnieuw kiest; die waarschuwing wijst ze voor je aan.

## 0.29.0

Een ronde langs de hele app op zoek naar stille rekenfouten: antwoorden die er
geloofwaardig uitzagen en niet klopten. Aanleiding was de reisplanner die 57
minuten gaf waar 9292 er 42 gaf. Alles hieronder is met een test vastgelegd die
aantoonbaar faalt op de vorige versie.

**Vertrektijden**

- **Een OV-rit die voor middernacht vertrok stond een dag mis.** Begint er iets
  om 00:30 en haal je daar de laatste trein van 23:50 voor, dan rekende de app
  24 uur de verkeerde kant op. Dat moment stuurt je meldingen: de herinnering
  kwam een dag te laat.
- **In de nacht van de tijdswissel klopte je vertrektijd een uur niet.** De app
  rekende in milliseconden terug vanaf de starttijd, terwijl die nacht 23 of 25
  uur duurt. Het scherm zei 22:50, de melding ging om 23:50.
- **Rijdt er niets dat op tijd aankomt**, dan toont de app de eerstvolgende rit
  daarna. Die gold als "de dag ervoor", waardoor de vertrekregel uit de dag
  verdween en er geen melding kwam. Nu staat hij er gewoon.
- **De veiligheidsmarge deed bij OV niets.** Die marge bepaalt welke rit je
  krijgt, maar zat niet in de sleutel waarmee de app bepaalt of een berekende
  reis nog geldig is. Van 10 naar 30 minuten veranderde er niets op het scherm.
- **Een stage of vakantie plande zijn rit altijd op de eerste dag.** In oktober
  vroeg de app nog de dienstregeling van 1 september op — een datum in het
  verleden.
- **Een gewijzigde eindtijd haalde de terugreis niet opnieuw op.** De oude
  thuiskomsttijd bleef staan, en dan ook nog zonder het bijschrift dat het om
  een reis van een andere dag ging.
- **Op een dag waarop je doorreist naar de sportschool** stond soms noch de
  doorreis noch de thuisreis: de kaart zweeg over de hele rest van de dag.

**Reisplanner**

- **De app praatte met een oude versie van de planner.** MOTIS nummert zijn
  plan-endpoint apart, en de app zat nog op v1 terwijl v6 de huidige is. Dat is
  geen detail: alle instellingen die de app meestuurt — één beste rit in plaats
  van een vertrekbord, hoe lang je naar de halte mag lopen, hoe overstappen
  worden berekend — horen bij de v6-beschrijving. Wat een oudere versie daar
  niet van kent, negeert hij stilzwijgend, en dan krijg je een antwoord dat er
  goed uitziet maar niet is wat je vroeg. v1 blijft als terugval staan.
- **Overstappen worden nu over de echte straat berekend.** Standaard gebruikt de
  planner de vaste looppaden die bij de dienstregeling zitten, en die zijn niet
  compleet: ontbreekt er een tussen het perron en het busstation ernaast, dan
  bestáát die overstap voor de planner niet — ook al loop je het in drie
  minuten. Hij komt dan uit op een latere bus vanaf een halte die wél in de
  lijst staat. Precies het soort omweg dat er geloofwaardig uitziet en een
  kwartier kost.
- **De app kiest zelf de beste rit** in plaats van de eerste die de planner
  teruggeeft. Op een heenreis was dat vaak de vroegste vertrektijd met de
  langste route. Bij "uiterlijk aankomen om" wint nu de laatste vertrektijd die
  het haalt, bij een terugreis de vroegste aankomst, en een overstap weegt mee
  als vijf minuten.
- **Lopen kan altijd, ook met een fiets.** Stond "fiets naar de halte" aan, dan
  viel de halte om de hoek af en kwam je op een verder station uit.
- **De fiets staat nu aan de goede kant van de rit.** Je fiets staat thuis: heen
  is dat het eerste stuk, terug het laatste. De app zette hem altijd vooraan,
  dus naar huis toe mocht je een half uur fietsen vanaf school en maar twintig
  minuten lopen vanaf je eigen station.
- **Twintig minuten naar het station lopen mag**; de planner hield het uit
  zichzelf op een kwartier en stuurde je anders om met een extra bus.
- **Live vertraging is weer live.** De server bewaarde een OV-uitkomst tien
  minuten terwijl de app elke twee minuten ververst. "Op tijd" bleef staan voor
  een trein die allang negen minuten te laat was.
- **Doorbladeren voorbij de laatste rit** wist de hele lijst en beide knoppen.
  Nu blijft je lijst staan met "Verder rijdt er vandaag niets meer".
- **Rijdt er niets**, dan volgt de directe loop- of fietsroute in plaats van
  "geen verbinding".
- **Haperde het zoeken naar haltes**, dan werd dat halve antwoord 24 uur lang
  bewaard: "Almere Centrum" gaf dan de wijk in plaats van het station, en
  opnieuw zoeken hielp niet.

**Je gegevens**

- **De agenda van de vorige gebruiker belandde in het volgende account.**
  Uitloggen wiste de agenda niet uit het geheugen; logde daarna iemand anders
  in op hetzelfde apparaat, dan werd alles — thuisadres incluis — naar diens
  account gepusht.
- **Wat je weggooit blijft weg.** Samenvoegen met de cloud was een unie: alles
  wat je op het ene apparaat weggooide kwam terug zodra het andere het nog
  kende. Ongedaan maken werkt gewoon.
- **Wat je offline aan je instellingen wijzigde blijft staan.** De cloud won
  altijd, dus je marge sprong terug.
- **Een zelfgemaakt activiteitstype werd stil "School"** — bij import, maar ook
  bij elke keer dat de app je agenda uit de cloud haalde.
- **Mislukt opslaan is niet langer stil.** Zit de opslag van je browser vol of
  staat hij uit, dan stond alles wat je invoerde alleen op het scherm en was het
  na één keer herladen weg. Nu staat er een melding bovenaan.
- **Zet je bij een activiteit van meer dagen alsnog "herhalen" aan**, dan bleef
  de oude einddatum staan: dag 2 t/m 5 verdwenen zonder melding en op de kaart
  stond "dag 8 van 5".

**Rooster en agenda's koppelen**

- **Een afgelaste les bleef staan en een verplaatste les kwam dubbel.** De
  koppeling waarmee een agenda zo'n wijziging meldt werd genegeerd.
- **Dagelijkse, maandelijkse en jaarlijkse herhalingen** werden één losse
  afspraak. Je eigen agenda erbij koppelen zit er vol mee.
- **Twee gekoppelde agenda's overschreven elkaars sync-tijdstip**, waarna de
  eerste bij elke tik opnieuw het net op ging.
- **Een meegestuurde duur werd genegeerd.** Staat er geen eindtijd maar wel een
  duur — wat agenda's vaak doen — dan nam de app stil een uur aan. Een werkgroep
  van 09:00 tot 10:45 stond tot 10:00 in je agenda.
- **De laatste dag van een vakantie viel eraf** als de zomertijd binnen die
  periode eindigde: die dag duurt 25 uur, en de app rekende met 24.

**Agenda en weekraster**

- **"Eerstvolgende" liet een vrije dag de echte afspraak verdringen.** Iets dat
  de hele dag duurt heeft geen tijdstip en dus geen vertrektijd, maar stond wel
  bovenaan — dus "Herfstvakantie" in plaats van de tandarts van 10:00.
- **Een maandelijkse reeks viel buiten beeld.** De kaart keek drie weken
  vooruit; huur op de 1e is vanaf 7 september 24 dagen wachten. Nu twee maanden.
- **Slepen tot onder aan het scherm** gaf eindtijd 00:00, en daar klapte het
  hele weekraster op dicht. Nu kun je tot 23:59.
- **Een hele reeks verslepen liet de overgeslagen dagen achter** op hun oude
  datum, waarna een dag die je bewust had weggehaald weer opdook.
- **Eén dag uit een reeks slepen** toonde "verwijderd — ongedaan maken". Klikte
  je daarop, dan stond de activiteit dubbel. Verplaatsen is nu één handeling,
  en het balkje zegt wat het doet.
- **Zoeken naar een afgelopen reeks** gaf de eerste keer in plaats van de
  laatste: "wanneer was dat practicum ook alweer" wees naar februari terwijl
  het in juni ophield.
- **Een reeks aanpassen vanuit een latere week wiste de eerdere dagen.** Klik je
  op het blok van woensdag van een reeks die op maandag begon, verander je
  alleen de kleur en sla je op, dan werd woensdag de nieuwe startdatum en
  verdween de maandag.
- **Dupliceren van een vakantie van vijf dagen** maakte er stil één dag van
  09:00 tot 10:00 van. Slepen had hetzelfde probleem.
- **De dagtijdlijn zei bij de terugreis altijd "rijden"**, ook met de trein of
  op de fiets.

**Meldingen**

- **Een vertrek verder dan zes uur weg werd nooit alsnog ingepland.** Liet je de
  app 's ochtends openstaan, dan kwam de melding voor 17:00 gewoon niet.
- **Twee wijzigingen binnen vijf minuten**: de tweede bereikte de server nooit,
  dus stonden er verkeerde meldingen klaar.
- **De wachtrij werd eerst gewist en dan gevuld.** Mislukte dat vullen, dan
  stond hij leeg en kreeg je die dag niets — terwijl iets verouderde tijden nog
  altijd beter zijn dan niets.
- **De app keek niet of het versturen lukte**, dus een serverfout gold als
  geslaagd en werd nooit opnieuw geprobeerd.
- **Een verlopen abonnement** werd door de server opgeruimd terwijl de app "aan"
  bleef tonen. De app meldt zich nu opnieuw aan.
- **Meldingen bleven in de oude taal** na het wisselen van taal, en
  serverfoutmeldingen kwamen in de taal van je browser in plaats van die van de
  app.

**Offline**

- **De app opende niet zonder bereik.** Alleen de offline-pagina en de iconen
  stonden voorgeladen, geen enkel scherm van de app zelf: die kwamen er alleen
  in als je ze ooit met een harde paginalading had geopend. Wie zijn agenda via
  het menu opende, kreeg in de trein "je bent offline" terwijl zijn gegevens
  gewoon op het apparaat stonden.
- **Mislukte antwoorden werden bewaard.** Een 404 tijdens een uitrol of de
  inlogpagina van een captive portal op schoolwifi belandde in de cache, en
  daarna deed de app het niet meer tot de volgende versie.
- **Eén mislukte download liet de app zonder offline-pagina achter**, voorgoed.
- **Tikken op een vertrekmelding** haalde het openstaande venster naar voren
  zonder ergens heen te gaan.

**Rooster**

- **Eigen aanpassingen aan een gekoppelde les** — kleur, vervoermiddel — waren
  na elke verversing weer weg.

**Beveiliging**

- **Een IPv4-adres vermomd als IPv6 glipte volledig langs de controle** op een
  agenda-link. Het metadata-adres van de cloudprovider was zo gewoon op te
  vragen.
- **Elke hostnaam die met "fc" of "fd" begint** werd geweigerd als privé-adres;
  fd.nl kon dus geen agenda-link zijn.
- **Alleen de naam werd gecontroleerd, nooit waar die naam heen wijst.** De
  server zoekt de naam nu op en weigert elk adres dat naar binnen wijst, ook bij
  elke omleiding.
- **De 4MB-grens telde pas nadat het hele bestand in het geheugen stond**, en
  alleen als de bron een lengte meestuurde.
- **De verkeersdrempel was met één kopregel te omzeilen.** Hij las een waarde
  die de bezoeker zelf invult; wie bij elke aanvraag een ander adres verzon
  kreeg elke keer een verse emmer.
- **Aanmelden voor meldingen accepteerde elk https-adres**, en de server roept
  dat adres later zelf aan. Nu alleen de pushdiensten van de browsers.

**Onder de motorkap**

- `src/lib/transitQuery.ts` bouwt de vraag aan de OV-planner op, met de
  standaardwaarden van MOTIS erbij gedocumenteerd en onder test. Die parameters
  bepalen het antwoord meer dan welke code dan ook.
- De tests draaien in Europe/Amsterdam in plaats van UTC: in UTC komt de nacht
  van de tijdswissel nooit langs.
- `scripts/reis-check.mjs` laat zien wat de OV-planner echt teruggeeft, met
  varianten naast elkaar. Bedoeld om een verschil met 9292 te herleiden tot de
  gegevens of tot een instelling.
- Van 152 naar 215 tests.

## 0.28.0

- **De app kiest nu zelf de beste rit.** De reisplanner geeft meerdere opties terug die elk
  ergens beter in zijn — de een vertrekt later, de ander komt eerder aan — en in welke volgorde
  dat binnenkomt ligt niet vast. De app pakte gewoon de eerste, en op een heenreis was dat vaak
  de **vroegste vertrektijd met de langste route**: je stond een half uur te vroeg op het
  perron voor een omweg. Nu vraagt de app er vijf op en kiest hij bewust: bij "uiterlijk
  aankomen om" de laatste vertrektijd waarmee je nog op tijd bent, bij een terugreis de
  vroegste aankomst.
- **Een overstap telt mee.** Vijf minuten later de deur uit is fijn, maar niet als je er een
  extra overstap voor terugkrijgt: die kost tijd op het perron en gaat als eerste mis bij
  vertraging. Een overstap weegt daarom als vijf minuten.
- **Lopen kan altijd, ook met een fiets.** Wie "fiets naar de halte" aan had staan kón niet meer
  lopen: de halte om de hoek viel af en je kwam op een verder station uit. Nu liggen lopen en
  fietsen naast elkaar en kiest de planner per rit wat sneller is.
- **Twintig minuten naar het station lopen mag.** De planner hield het uit zichzelf op een
  kwartier, en wie verder liep kreeg daardoor geen wandelroute maar een omweg met een extra bus.
- **Geen dubbele en geen zinloze opties meer.** Een rit die eerder weg moet én later aankomt dan
  een andere valt weg, net als dezelfde trein die twee keer verschijnt met een net ander looppad.
  De lijst staat op vertrektijd zoals een vertrekbord, en de kortste rit krijgt het merkje
  *snelste*, want die hoeft niet bovenaan te staan.
- **De nachtrit van vier uur staat er niet meer bij.** Een rit die om 01:00 vertrekt en om 05:28
  aankomt is formeel de vroegste aankomst, dus die bleef bovenaan staan naast ritten van 57
  minuten. Niemand wacht vier uur op een station: opties die meer dan twee keer zo lang duren
  als de snelste vallen weg.
- **Rijdt er niets, dan volgt de loop- of fietsroute.** Voor een bestemming zonder OV in de buurt
  zei de app "geen verbinding"; nu krijg je gewoon de directe route, tot drie kwartier.

## 0.18.0 t/m 0.27.0

Nog niet uitgeschreven in dit bestand. Wat er in die versies veranderde staat wel in de
commitberichten (`git log --oneline`).

## 0.17.1

- **De hele achtergrond krijgt je kleur, de kaarten niet.** Eerst waren ook de kaarten, vlakken
  en randen getint, waardoor de kleur als een waas over alles lag wat je leest. Nu verandert
  alleen de achtergrond: kies je roze, dan is de donkere achtergrond donkerroze en blijven je
  kaarten neutraal grijs.
- **Uit te zetten** bij Instellingen → Kleur van de app, voor wie liever een neutrale achtergrond
  met alleen gekleurde knoppen heeft.

## 0.17.0

- **Fietsen naar het station.** De app liet je altijd lopen naar de halte, terwijl vrijwel elke
  student fietst. Op Almere naar Zwolle scheelt dat **90 tegen 66 minuten** met precies dezelfde
  trein: je vertrektijd stond dus bijna een half uur te vroeg. In Instellingen kies je tussen
  lopen, fiets heen, of een fiets aan beide kanten (je tweede fiets of een OV-fiets). Zowel je
  agenda als de reisplanner volgt die keuze.
- **Je rooster houdt zichzelf bij.** Koppel je het via een link, dan haalt de app het hoogstens
  een keer per dag stil opnieuw op. Verschoven en uitgevallen uren kloppen daarmee vanzelf,
  zonder dat je eraan hoeft te denken. Levert het rooster niets op, dan blijft je bestaande
  agenda staan in plaats van leeg te lopen. De koppeling is met een knop te verbreken.
- **Je dag delen.** Eén knop op Vandaag stuurt je planning met vertrektijden naar WhatsApp of wat
  je verder gebruikt: "09:00-17:00 College (vertrek 07:41)". Op een laptop gaat het naar je
  klembord. Bij activiteiten thuis staat er geen vertrektijd, want die is er niet.

## 0.16.4

- **Ook de donkere achtergrond kleurt nu echt mee.** Die bleef bijna zwart met een vleugje kleur;
  kies je groen, dan is de achtergrond nu donkergroen. Elke laag krijgt dezelfde tint op een
  lichtere ondergrond, zodat achtergrond, kaarten en vlakken van elkaar te onderscheiden blijven.

## 0.16.3

- **Echte achtergrondkleur in plaats van een gloed.** De kleurwaas over het scherm is weg; de
  achtergrond zelf heeft nu jouw kleur, met bijna-witte kaarten erop. Rustiger, en het leest als
  een achtergrond in plaats van als een filter.

## 0.16.2

Een ronde langs de app op zoek naar fouten en losse eindjes.

- **Rooster over de tijdswissel.** Een wekelijkse les van 09:00 werd na het einde
  van de zomertijd 08:00: de herhaling rekende in blokken van 24 uur, maar die
  nacht duurt er 25. De herhaling telt nu kalenderdagen en zet de kloktijd
  daarna terug. Met een test erbij.
- **Weekdagen in het week- en maandraster** stonden nog vast in het Nederlands en
  bleven "ma di wo" in de Engelse app.
- **Zoeksuggesties in het Engels.** De omschrijving "Halte of station" en de
  plaatsnamen kwamen altijd in het Nederlands terug; nu volgen ze je taal
  ("Stop or station", "North Holland").
- **Live verversen alleen wanneer het telt.** Een OV-rit van vandaag werd de hele
  dag elke twee minuten ververst, ook uren nadat de les voorbij was. Dat gebeurt
  nu vanaf drie uur voor de start tot het einde. Twee kaarten van dezelfde
  activiteit delen bovendien één aanvraag in plaats van er allebei een te doen.
- **ESLint werkt weer.** `npm run lint` opende een installatievraag in plaats van
  te controleren. Nu draait het echt, en de elf punten die het vond zijn opgelost:
  een volledige paginaherlaad op de foutpagina, een dode import, een ongebruikte
  prop, en formulierfouten die na het wisselen van taal in de oude taal bleven staan.
- **App-icoon offline.** De service worker laadde de nieuwe PNG-iconen niet voor,
  waardoor installeren zonder bereik een leeg vlak op je beginscherm gaf.

## 0.16.1

- **De gekozen kleur is nu overal te zien.** Niet alleen de knoppen: de achtergrond krijgt een
  zachte gloed in je kleur, en kaarten, randen en vlakken zijn er licht mee getint. De
  tekstkleuren blijven neutraal, zodat alles leesbaar blijft welke kleur je ook kiest.
- **Hydratatiewaarschuwing opgelost.** Het script dat de kleur vóór de eerste weergave zet
  wijzigt `<html>`, waardoor React meldde dat server en browser verschilden. Dat verschil is
  bedoeld en staat nu als zodanig gemarkeerd.

## 0.16.0

- **Kies je eigen kleur.** In Instellingen staat nu "Kleur van de app" met acht kleuren: blauw,
  indigo, paars, roze, rood, oranje, groen en turquoise. De hele app wisselt mee: knoppen,
  actieve tabbladen, focusranden en de nadruk op je vertrektijd. Elk thema heeft een eigen tint
  voor de lichte en de donkere weergave, want een kleur die mooi is op wit is te donker op zwart.
  De kleur wordt gezet vóór de eerste weergave, dus je ziet geen blauwe flits bij het openen.

## 0.15.0

- **Taalkeuze: Nederlands of Engels.** In Instellingen staat een knop met twee talen. Kies je
  Engels, dan is de hele app Engels: schermen, formulieren, foutmeldingen, en ook datums
  ("Thursday, September 4"), duur ("1 h 23 min"), herhalingen ("Every weekday") en afstanden
  (12.5 km met een punt in plaats van een komma). Bij de eerste keer openen kijkt de app naar de
  taal van je telefoon; daarna geldt je eigen keuze, per apparaat.
- Techniek: `src/lib/i18n` met Nederlands als bron. Engels moet dezelfde sleutels hebben, anders
  bouwt de app niet, zodat er geen half vertaald scherm kan ontstaan. Berichten van de server
  worden ook vertaald: de app stuurt de gekozen taal mee, en `ProviderError` draagt een sleutel
  in plaats van een kant-en-klare zin.

## 0.14.0

- **Schoolrooster koppelen.** Instellingen heeft nu "Schoolrooster koppelen": plak de iCal-link
  uit Magister, Somtoday, Zermelo, Google Agenda of Outlook, of kies een .ics-bestand. De app
  leest je lessen van de komende 8 weken in, laat ze eerst zien, en zet ze pas na jouw akkoord in
  de agenda. Je kiest daarbij het adres van je school, want het lokaal uit je rooster ("A1.23")
  is geen adres waar een routeplanner iets mee kan.
  Opnieuw ophalen vervangt de vorige import, zodat verschoven en uitgevallen uren vanzelf
  kloppen; activiteiten die je zelf toevoegde blijven staan.
- Techniek: eigen iCal-lezer (`src/lib/ical.ts`) met 12 tests, inclusief zomer- en wintertijd,
  wekelijkse herhalingen, uitzonderingsdagen en afgelaste lessen. De route die de link ophaalt
  weigert adressen binnen een netwerk, ook via een omleiding, en heeft een grens op omvang en
  tijd (`src/lib/safeUrl.ts`, 9 tests).

## 0.13.0

- **Echte app-iconen.** PNG's van 192 en 512 px, een maskable variant voor Android en een
  apple-touch-icon. Er was alleen een SVG, en die zet geen enkele telefoon op je beginscherm.
  De klok staat op 08:23, de tijd uit het idee achter de app.
- **Leertijd inplannen vanuit een opdracht of toets.** Eén knop maakt een leerblok op de dag voor
  de deadline, met de geschatte tijd als lengte en de koppeling al gelegd.

## 0.12.2

- Het tabblad **Reizen** heet nu **Reisplanner**.

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
