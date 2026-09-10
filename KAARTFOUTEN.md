# Kaartfouten die de reistijd raken

De app rekent zelf geen routes uit. Reistijden komen van
[transitous](https://transitous.org/) (MOTIS), en de looproutes daarin komen uit
**OpenStreetMap**. Klopt de kaart niet, dan klopt de vertrektijd niet, en daar is
in de app niets aan te doen: een kortere route verzinnen is precies wat deze app
niet hoort te doen.

Dit bestand houdt de plekken bij waar dat speelt, met genoeg bewijs erbij om ze
te kunnen melden of zelf in OpenStreetMap recht te zetten. Zodra zo'n punt is
opgelost, mag het hier weg.

---

## Lelystad, halte Palazzo → Donaustraat

**Wat je merkt.** Reis je met bus 207 richting Harderwijk naar de Donaustraat in
Lelystad, dan zegt de app dat je 916 meter moet lopen. 9292 zegt 693 meter over
hetzelfde stuk. Dat scheelt ongeveer een minuut op de hele reis — de app zit er
dus een minuut naast, aan de veilige kant.

**Wat er aan de hand lijkt te zijn.** Twee dingen, waarvan de eerste hard te
meten is.

### 1. De Torenvalktunnel wordt gelopen alsof je erdoorheen kruipt

Bus 207 richting Harderwijk zet je af aan de noordkant van de Larserdreef
(`52.491467, 5.485912`, haltenummer `nl-OpenOV_3191809`). Om naar de zuidkant te
komen loop je door de **Torenvalktunnel**. De router doet daar 10 minuten over
211 meter — ongeveer 1,2 km/h. Direct daarna gaat het weer normaal:

| stuk vanaf het perron | afstand | tijd | snelheid |
| --- | --- | --- | --- |
| eerste stukje | 42 m | 1 min | 2,5 km/h |
| naar de tunnelmond | 83 m | 4 min | **1,2 km/h** |
| door de tunnel | 86 m | 5 min | **1,0 km/h** |
| Ketelmeerstraat daarna | 197 m | 1 min | 11,8 km/h |
| de rest tot de deur | 494 m | 6 min | 4,9 km/h |

De ways die het betreft lopen langs deze OSM-nodes:
`1959427401` → `1959427395` → `263360523` → `263360521` → `263360522` →
`263360520`. De drie laatste stukjes heten `Torenvalktunnel`.

**Wat er waarschijnlijk mis is.** Twee stukken van elk 3 à 4 minuten aan de twee
uiteinden, met een traag stuk ertussen: dat is het patroon van **trappen**. Zijn
de op- en afritten van die tunnel in OpenStreetMap getagd als `highway=steps`
terwijl het in het echt hellingbanen zijn (het is een fiets- en voetgangers­tunnel),
dan verklaart dat precies deze getallen. Ook de moeite waard om te controleren:
een `incline`, een `barrier` of een ontbrekende `foot=yes` op die ways.

Het is geen instelling van de planner: `elevationCosts`, `pedestrianProfile`,
`maxMatchingDistance` en `useRoutedTransfers` maken geen enkel verschil — de
straftijd zit in de kaartgegevens zelf.

### 2. De route is 223 meter langer dan die van 9292

Hemelsbreed is het van dat perron naar Donaustraat 184 **606 meter**. Onze route
is 916 meter (1,5× de rechte lijn), die van 9292 693 meter (1,14× — bijna recht).

Vanaf de tunneluitgang (`52.491769, 5.487261`) is het in rechte lijn nog 542
meter naar de deur. Een route van 693 meter in totaal kán dus niet door die
tunneluitgang lopen: dan zou het laatste stuk korter zijn dan de rechte lijn.
**9292 steekt ergens anders over.** Welk pad of welke oversteek er in
OpenStreetMap ontbreekt, is van hieruit niet vast te stellen — daar is een blik
op de kaart of ter plaatse voor nodig.

**Extra aanwijzing.** Vraag je dezelfde twee punten aan de publieke
OSRM-demo, dan komt daar **777 meter** uit. Dat is een autoroute (die demo kent
alleen het autoprofiel — `foot`, `walking` en `cycling` geven allemaal hetzelfde
antwoord op 36 km/h), maar het betekent wel dat er over gewone wegen een
verbinding van 777 meter ligt. Een looproute die lánger is dan de autoroute is
in een woonwijk een vreemde uitkomst: te voet mag je overal waar een auto mag,
plus de paden ertussen.

Dat kan twee dingen betekenen, en welke van de twee is van hieruit niet te
zeggen. Óf de dreef is voor voetgangers terecht afgesloten en moet je echt door
de tunnel — dan is 916 meter gewoon goed en loopt 9292 je over een stuk waar je
niet hoort te lopen. Óf er ontbreekt een oversteek of pad in de kaart. Dat is
precies wat er ter plaatse gecontroleerd moet worden.

Zijkant om te controleren: de twee haltes met de naam "Lelystad, Palazzo"
(`nl-OpenOV_3191808` op `52.490593, 5.487986` en `nl-OpenOV_3191809` op
`52.491467, 5.485912`) liggen 172 meter uit elkaar. Dat is veel voor een
haltepaar. Staat er één op de verkeerde plek, dan verklaart dat een deel van het
verschil.

### Zelf nameten

```bash
# De autoroute tussen dezelfde twee punten, ter vergelijking:
curl -s "https://router.project-osrm.org/route/v1/driving/\
5.485912,52.491467;5.49395117,52.48909172?overview=false" | jq '.routes[0].distance'

# De hele rit, zoals de app hem opvraagt:
node scripts/reis-check.mjs "Gran Canariastraat 60, Almere" \
  "Donaustraat 184, Lelystad" 2026-09-11T06:40

# Alleen het loopstuk vanaf het perron van bus 207:
curl -s "https://api.transitous.org/api/v6/plan?fromPlace=52.491467,5.485912\
&toPlace=52.48909172,5.49395117&time=2026-09-11T06:00:00Z&directModes=WALK\
&transitModes=&maxDirectTime=7200&pedestrianSpeed=1.4" \
  -H "User-Agent: VertrektijdAgenda/dev" | jq '.direct[0].legs[0] | {distance, duration}'
```

### Wat de app er ondertussen mee doet

De app rekent sinds 0.34.0 het láátste loopstuk zelf na op de eigen loopsnelheid
(`src/lib/finalWalk.ts`), waardoor die 18 minuten op 12 uitkomen. De afstand
blijft die van de kaart: 916 meter. Zolang die 223 meter erin zit, is de app op
deze route ongeveer een minuut voorzichtiger dan 9292 — en dat is de goede kant
om aan te zitten.
