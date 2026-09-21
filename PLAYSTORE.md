# Naar de Play Store

Wat er moet gebeuren om deze app als betaalde app in de Google Play Store te
krijgen, en wat er al klaarstaat.

De app is een PWA. Voor de Play Store wordt hij verpakt in een **TWA** (Trusted
Web Activity): een Android-app die niets anders doet dan deze site openen,
zonder adresbalk. Er komt dus geen tweede versie van de app — wat je op het web
deploy't, is wat in de winkel staat.

---

## Eerst: mag het eigenlijk?

**Dit is de enige stap die echt vóór de rest moet, en de enige die niet in code
op te lossen is.**

De hele reisfunctie draait op [transitous](https://transitous.org), een gratis,
door vrijwilligers gedraaide dienst zonder API-sleutel. Prima voor persoonlijk
gebruik. Maar zodra je geld vraagt voor een app die daarop leunt, verandert er
iets:

- Hun voorwaarden staan op <https://transitous.org/api/>. **Lees die eerst.** Of
  commercieel gebruik mag, hangt daarvan af.
- Ook als het mag: je maakt betalende klanten afhankelijk van een dienst die jou
  niets verschuldigd is. Gaan zij eruit of komt er een limiet, dan staat jouw
  app stil bij mensen die ervoor betaald hebben.

Een grotere server lost dit **niet** op — de data is het probleem, niet de
rekenkracht. De echte uitwegen zijn een commerciële afspraak met NS of 9292, of
MOTIS zelf draaien met eigen GTFS-feeds. Dat laatste is een serverproject van
formaat, en pas de moeite als er inkomsten zijn.

### Een bericht om te sturen

Ze zijn te bereiken via de Matrix-kanaal en Mastodon die in hun
[README](https://github.com/public-transport/transitous) staan.

> Hallo,
>
> Ik heb een agenda-app gebouwd die uitrekent hoe laat je moet vertrekken, met
> jullie API voor de OV-planning. Tot nu toe gebruik ik hem zelf; ik overweeg
> hem in de Play Store te zetten, waarschijnlijk als betaalde app.
>
> Voordat ik dat doe wil ik het netjes regelen. Drie vragen:
>
> 1. Is commercieel gebruik van api.transitous.org toegestaan?
> 2. Is er een limiet of richtlijn waar ik me aan moet houden? De app stuurt nu
>    een herkenbare User-Agent mee en remt aanvragen af per gebruiker.
> 3. Zou een bijdrage of sponsoring helpen als het volume groeit?
>
> Ik hoor het graag, en anders zoek ik een andere oplossing.
>
> Met vriendelijke groet,

---

## Wat al klaarstaat

| | |
| --- | --- |
| Manifest met schermafdrukken, snelkoppelingen en een vaste `id` | `public/manifest.webmanifest` |
| Schermafdrukken, uit de echte app | `npm run schermafdrukken` |
| Digital Asset Links | `/.well-known/assetlinks.json` (route, leest de vingerafdruk uit de omgeving) |
| TWA-instellingen | `twa-manifest.json` |
| Privacyverklaring, ook zonder bereik | `/privacy` |
| Account verwijderen (Play eist dit) | `/instellingen` en `/api/account/delete` |
| Beveiligingsheaders | `next.config.ts` |
| Eén verkeersdrempel over alle servers | `SUPABASE-SETUP.md` §8c |

## Wat jij moet doen

### 1. Vercel naar Pro

Het gratis Hobby-plan van Vercel is **alleen voor niet-commercieel gebruik**.
Zodra je geld vraagt heb je Pro nodig (ongeveer $20 per maand). Controleer de
actuele voorwaarden zelf; dit verandert soms.

### 2. De gedeelde verkeersdrempel aanzetten

De SQL staat in `SUPABASE-SETUP.md` §8c. Plakken in de SQL Editor, klaar. Zonder
deze tabel telt elke server apart, en dan is je grens van dertig per minuut in
de praktijk een veelvoud daarvan — dat is je enige rem op de rekening.

### 3. Een eigen domein

Een TWA moet op een domein staan dat van jou is, want de asset links moeten
vanaf datzelfde domein komen. `*.vercel.app` kan technisch, maar je wilt dit
niet op een adres dat je kwijt kunt raken.

Zet daarna in Vercel:

```
NEXT_PUBLIC_SITE_URL=https://jouwdomein.nl
ANDROID_PACKAGE_NAME=nl.vertrektijd.agenda
```

### 4. De TWA bouwen

Draai Bubblewrap **buiten deze repo**, in een eigen map. Het Android-project dat
hij genereert hoort niet bij de website-code, en zo kan het ook niet per ongeluk
meegecommit worden.

```bash
npm install -g @bubblewrap/cli
mkdir ../vertrektijd-android && cd ../vertrektijd-android
cp ../vertrektijd-agenda/twa-manifest.json .
# Vervang VUL-JE-DOMEIN-IN.nl door je eigen domein, en dan:
bubblewrap build
```

Bubblewrap maakt een ondertekensleutel (`android.keystore`). **Bewaar die
buiten deze repo en maak er een back-up van.** Raak je hem kwijt, dan kun je
nooit meer een update uitbrengen onder dezelfde app — je moet dan opnieuw
beginnen met een nieuw pakket-id en verlies je al je gebruikers.

`android.keystore` staat in `.gitignore`. Laat dat zo.

### 5. De vingerafdruk terugkoppelen

Na het uploaden naar Play Console: **App signing → App signing key certificate
→ SHA-256**. Die waarde (32 paren hex met dubbele punten) zet je in Vercel:

```
ANDROID_SHA256_FINGERPRINT=AB:CD:...:EF
```

Deploy opnieuw, en controleer dat
`https://jouwdomein.nl/.well-known/assetlinks.json` nu een regel teruggeeft in
plaats van `[]`. Klopt dit niet, dan opent de app mét browserbalk en ziet hij
eruit als een website in plaats van als een app.

> Play Console tekent standaard zelf je app (Play App Signing). Dan is de
> vingerafdruk die je hierboven nodig hebt die van Google, niet die van je eigen
> keystore. Neem hem dus uit Play Console over, niet uit je eigen bestand.

### 6. Play Console

- Account aanmaken: €25 eenmalig.
- **Betaalde app**, geen abonnement. Dan heb je geen Google Play Billing-
  integratie nodig; de aankoop gaat bij het installeren.
- Het **Data safety**-formulier invullen. De app verzamelt: e-mailadres (alleen
  bij een account), agenda-inhoud (in je eigen account) en locatie (alleen als
  je erom vraagt in de reisplanner). Dit staat allemaal in `/privacy`.
- Link naar de privacyverklaring: `https://jouwdomein.nl/privacy`.
- Account verwijderen: Google wil een webadres waar dat kan. Dat is
  `https://jouwdomein.nl/instellingen`.

---

## Wanneer is "een betere server" aan de orde?

Niet bij het begin. Vercel Pro en het gratis Supabase-plan trekken je eerste
honderden gebruikers zonder klagen. Let op deze drie signalen:

| Signaal | Wat het betekent |
| --- | --- |
| Supabase zit tegen de 500 MB of pauzeert | Naar een betaald Supabase-plan (vanaf ~$25/maand). |
| 429's van transitous, Nominatim of OSRM | Je bent te groot voor fair use. Dít is het moment voor eigen OV-data. |
| Vercel-functies lopen tegen hun tijdslimiet | Zelden bij deze app; eerst kijken of het een trage externe dienst is. |

De eerste twee zijn goedkoop op te lossen. De derde is een luxeprobleem.

Wat je **niet** moet doen is vooraf een server kopen. Er draait hier niets wat
een eigen machine nodig heeft, tot het moment dat je eigen OV-data wilt — en dan
weet je dat, omdat de 429's binnenkomen.
