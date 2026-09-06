# Account & synchronisatie instellen (Supabase)

Met deze stappen activeer je login met e-mail + wachtwoord en synchronisatie
tussen apparaten. Het is gratis; de app blijft zonder deze stappen gewoon lokaal
werken.

## 1. Supabase-project maken

1. Ga naar **https://supabase.com** → **Start your project** → log in (mag met GitHub).
2. **New project** → geef het een naam (bv. `vertrektijd-agenda`), kies een sterk
   database-wachtwoord (hoef je later niet te onthouden voor de app) en een regio
   (bv. Frankfurt). Klik **Create new project** en wacht tot het klaar is.

## 2. De database klaarzetten

1. In je project: **SQL Editor** (linkermenu) → **New query**.
2. Open het bestand [`supabase/schema.sql`](supabase/schema.sql), kopieer de inhoud,
   plak die in de editor en klik **Run**. Je ziet "Success".

## 3. De twee sleutels ophalen

1. **Project Settings** (tandwiel) → **API**.
2. Noteer:
   - **Project URL** (bij "Project URL")
   - **anon public** key (bij "Project API keys" → `anon` `public`)

Deze twee zijn veilig om te gebruiken in de app; de database wordt beschermd door
Row Level Security (stap 2).

## 4. De sleutels in Vercel zetten

1. Ga naar je project op **vercel.com** → **Settings** → **Environment Variables**.
2. Voeg toe (voor alle omgevingen):
   - `NEXT_PUBLIC_SUPABASE_URL` = jouw Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = jouw anon public key
3. Ga naar **Deployments** → open de nieuwste → **Redeploy** (zodat de sleutels
   meegaan).

## 5. Inloggen met e-mail aanzetten

Zonder deze stap krijg je bij het inloggen **"Email logins are disabled"**.

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Zet **Enable email provider** (of "Email") **aan** en klik op **Save**.
3. Wil je ook dat nieuwe mensen zich kunnen registreren: laat **Allow new users
   to sign up** aan staan.

Standaard vraagt Supabase om je e-mail te bevestigen bij registratie.
- Wil je meteen kunnen inloggen zonder bevestiging: zet in datzelfde scherm
  **Confirm email** uit.
- Laat je het aan, dan krijg je bij registratie een bevestigingsmail; klik de link
  en log daarna in.

## 6. URL's instellen (anders werken de links uit de mail niet)

De links in de bevestigings- en herstelmail wijzen naar de **Site URL**. Staat die
nog op `http://localhost:3000`, dan krijg je op je telefoon "Safari kan de pagina
niet openen".

**Authentication** → **URL Configuration**:

- **Site URL**: `https://vertrektijd-agenda.vercel.app` (jouw eigen adres)
- **Redirect URLs**: voeg toe
  - `https://vertrektijd-agenda.vercel.app/**`
  - `http://localhost:3000/**` (alleen als je ook lokaal ontwikkelt)

Wachtwoord vergeten stuurt je naar `/wachtwoord`; die pagina valt onder de `/**`
hierboven, dus je hoeft hem niet apart toe te voegen.

## 7. Lokaal ontwikkelen (alleen als je de app ook lokaal draait)

Zet dezelfde twee waarden in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 8. Meldingen met de app dicht (optioneel)

De gewone herinneringen werken zolang de app openstaat. Wil je ook een seintje
krijgen met de app helemaal afgesloten, dan zijn deze vier stappen nodig.

**Hoe het in elkaar zit.** De server leest je agenda niet en kan dat ook niet.
Je telefoon rekent zelf uit wanneer je moet vertrekken en zet kant-en-klare
zinnen in een wachtrij: "stuur deze tekst om 07:04". De server weet dus alleen
een tijdstip en een zin, niet waar je heen gaat. De prijs daarvan: de wachtrij
loopt twee weken vooruit, dus je moet de app minstens eens per week openen.

### 8.1 De tabellen

**SQL Editor** → nieuwe query → plakken → **Run**:

```sql
create table if not exists public.push_devices (
  id uuid primary key,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_queue (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.push_devices(id) on delete cascade,
  send_at timestamptz not null,
  title text not null,
  body text not null default '',
  sent_at timestamptz
);

create index if not exists push_queue_due_idx
  on public.push_queue (send_at) where sent_at is null;

-- Aan, en bewust zonder policies: alleen de service-sleutel mag hierbij, en die
-- staat uitsluitend op de server. De browser praat via /api/push/*.
alter table public.push_devices enable row level security;
alter table public.push_queue enable row level security;
```

### 8.2 Het sleutelpaar

Draai dit op je eigen computer:

```
npx web-push generate-vapid-keys
```

Je krijgt een **Public Key** en een **Private Key**. De publieke helft hoort in
de browser, de geheime helft nooit. Geef die laatste dus geen `NEXT_PUBLIC_`.

### 8.3 De instellingen bij je hosting

In Vercel: **Settings → Environment Variables**, en daarna opnieuw deployen.

| Naam | Waarde |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | de publieke helft |
| `VAPID_PRIVATE_KEY` | de geheime helft |
| `VAPID_CONTACT` | `mailto:jij@voorbeeld.nl` |
| `PUSH_CRON_SECRET` | zelf verzinnen, lang en willekeurig |

`SUPABASE_SERVICE_ROLE_KEY` moet er al staan van stap 5.

Controleer daarna `https://jouw-app.vercel.app/api/health`: bij `features` horen
`pushNotifications` en `pushClock` allebei op `true` te staan. Die pagina toont
alleen ja of nee, nooit de sleutels zelf.

### 8.4 De klok

Vercel mag op het gratis pakket maar één taak per dag draaien, en dit moet elke
minuut. Daarom draait de klok in Supabase zelf.

**Database → Extensions**: zet `pg_cron` en `pg_net` aan. Daarna in de SQL
Editor, met je eigen adres en je eigen `PUSH_CRON_SECRET` ingevuld:

```sql
select cron.schedule(
  'vertrektijd-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://jouw-app.vercel.app/api/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer JOUW_PUSH_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Opgeruimd staat netjes: verstuurde en verlopen berichten gaan na twee dagen weg.
select cron.schedule(
  'vertrektijd-push-opruimen',
  '17 4 * * *',
  $$ delete from public.push_queue where send_at < now() - interval '2 days'; $$
);
```

Het geheim staat hiermee in je eigen database; alleen jij komt daarbij. Wil je
de taak later aanpassen, gebruik dan `select cron.unschedule('vertrektijd-push');`
en plan hem opnieuw.

### 8.5 Aanzetten

Open de app → **Instellingen → Herinneringen** → kies een aantal minuten en vink
**Ook als de app dicht is** aan.

Op een iPhone werkt dit alleen wanneer de app op je beginscherm staat: Safari →
delen → "Zet op beginscherm". Dat is een regel van Apple, niet van deze app.

## 9. Weten of iemand de app gebruikt (optioneel)

Zonder cijfers weet je niet of iemand hem opent, of je iets verbeterd of stuk
gemaakt hebt, en heb je niets om aan iemand te laten zien. Deze tellers draaien
in je eigen Supabase: geen extern statistiekenbedrijf, geen cookies, en niets
dat naar een persoon te herleiden is.

**Wat er opgeslagen wordt:** één rij per dag per gebeurtenis, met een getal
erbij. Meer niet. Geen apparaat-id, geen ip-adres, niets over agenda's. Dat
"aantal mensen" toch klopt komt doordat de app `dag_geopend` hooguit één keer
per dag verstuurt; dat houdt de browser zelf bij.

**SQL Editor** → nieuwe query → plakken → **Run**:

```sql
create table if not exists public.app_events (
  day date not null,
  name text not null,
  count integer not null default 0,
  primary key (day, name)
);

alter table public.app_events enable row level security;
-- Bewust zonder policies: alleen de service-sleutel schrijft, en die staat
-- uitsluitend op de server.

-- Ophogen in één stap, zodat twee gelijktijdige bezoekers elkaar niet wegdrukken.
create or replace function public.bump_app_event(event_name text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.app_events (day, name, count)
  values (current_date, event_name, 1)
  on conflict (day, name) do update set count = public.app_events.count + 1;
$$;
```

Er is geen extra instelling nodig: zodra `SUPABASE_SERVICE_ROLE_KEY` er staat
(stap 5) telt hij mee. Staat die er niet, dan doet `/api/stats` niets.

### Aflezen

**Table Editor → app_events**, of in de SQL Editor:

```sql
-- De laatste twee weken, per dag
select day, name, count
from public.app_events
where day > current_date - 14
order by day desc, count desc;

-- Hoeveel mensen openden de app per dag
select day, count
from public.app_events
where name = 'dag_geopend'
order by day desc;
```

De gebeurtenissen die geteld worden: `dag_geopend`, `activiteit_toegevoegd`,
`rooster_gekoppeld`, `agenda_gekoppeld`, `meldingen_aan`,
`meldingen_achtergrond_aan`, `reis_gezocht`, `rondleiding_gestart` en
`rooster_gewijzigd`. Andere namen weigert de server, zodat niemand de tabel kan
volschrijven.

## Klaar

Open de app → **Instellingen → Account & synchronisatie** → maak een account aan of
log in. Je agenda, schoolwerk en instellingen worden dan bewaard in je account en
zijn op elk apparaat waarop je inlogt hetzelfde.

**Hoe de sync werkt:** log je voor het eerst in terwijl je al lokaal gegevens had,
dan worden die naar je account gezet. Op een ander apparaat waarop je inlogt, wordt
de data uit je account geladen. Wijzigingen worden automatisch opgeslagen.
