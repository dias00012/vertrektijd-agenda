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

## Klaar

Open de app → **Instellingen → Account & synchronisatie** → maak een account aan of
log in. Je agenda, schoolwerk en instellingen worden dan bewaard in je account en
zijn op elk apparaat waarop je inlogt hetzelfde.

**Hoe de sync werkt:** log je voor het eerst in terwijl je al lokaal gegevens had,
dan worden die naar je account gezet. Op een ander apparaat waarop je inlogt, wordt
de data uit je account geladen. Wijzigingen worden automatisch opgeslagen.
