# Changelog

Kort overzicht per versie van wat er in de app is veranderd. Bedoeld zodat de
planner (de andere Claude) snel ziet wat er nieuw is.

Het **uitwisselformaat** (`app`, `version`, `settings`, `activities`, `tasks`, `exams`)
wordt bewust stabiel gehouden. De veldenlijst en een voorbeeldbestand staan in de
[README](README.md#back-up--synchronisatie-importexport) en in
[`examples/planner-voorbeeld.json`](examples/planner-voorbeeld.json).

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
