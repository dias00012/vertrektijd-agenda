import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Vertrektijd",
  description: "Wat Vertrektijd van je bewaart, waarom, en hoe je het weer weghaalt.",
};

/**
 * Privacyverklaring. Zodra andere mensen een account aanmaken bewaar je hun
 * e-mailadres, thuisadres en agenda: persoonsgegevens onder de AVG. Dan moet
 * ergens staan wát je bewaart, waarom, en hoe iemand dat weer weg krijgt.
 */
export default function PrivacyPage() {
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Kort en zonder kleine lettertjes: wat we bewaren, waarom, en hoe je het weghaalt.
        </p>
      </header>

      <div className="space-y-4">
        <Section title="🔒 Zonder account blijft alles op je eigen apparaat">
          <p>
            Gebruik je de app zonder in te loggen, dan staan je agenda, schoolwerk en instellingen
            uitsluitend in de opslag van je eigen browser. Ze worden niet verstuurd en wij kunnen
            er niet bij. Wis je je browsergegevens, dan zijn ze weg.
          </p>
        </Section>

        <Section title="👤 Met een account">
          <p>Log je in, dan bewaren we in je account:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Je e-mailadres en een versleuteld wachtwoord</strong> — om je te kunnen laten
              inloggen.
            </li>
            <li>
              <strong>Je agenda, schoolwerk en instellingen</strong> — inclusief je thuislocatie en
              opgeslagen locaties, want zonder die adressen kan de app geen vertrektijd berekenen.
            </li>
          </ul>
          <p className="mt-2">
            Dat staat in een database bij <strong>Supabase</strong> (servers in de EU), afgeschermd
            met Row Level Security: technisch kan alleen jouw eigen account bij jouw rij.
          </p>
        </Section>

        <Section title="🚆 Wat er naar buiten gaat">
          <p>Om reistijden en ritten te berekenen sturen we alleen coördinaten en tijdstippen naar:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>OpenStreetMap / Nominatim</strong> — om een adres om te zetten naar
              coördinaten.
            </li>
            <li>
              <strong>OSRM</strong> — reistijd met de auto.
            </li>
            <li>
              <strong>transitous (MOTIS)</strong> — OV-ritten, fiets- en looptijden.
            </li>
          </ul>
          <p className="mt-2">
            Die verzoeken lopen via onze eigen server, dus die diensten zien jouw IP-adres niet.
            Er gaat <strong>nooit</strong> een naam, e-mailadres of afspraaktitel mee — alleen een
            punt op de kaart en een tijd.
          </p>
        </Section>

        <Section title="📊 Geen tracking">
          <p>
            Geen advertenties, geen analytics, geen cookies van derden, geen doorverkoop van
            gegevens. Er staat één cookie-achtige waarde in je browser: je eigen inlogsessie.
          </p>
        </Section>

        <Section title="⏳ Hoe lang">
          <p>
            Zolang je je account hebt. Verwijder je het, dan gaan je e-mailadres en al je gegevens
            direct mee — er blijft geen kopie achter.
          </p>
        </Section>

        <Section title="🗑️ Je rechten">
          <p>
            Je mag je gegevens inzien, meenemen en laten verwijderen. Dat kun je allebei zelf, direct
            in de app:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Meenemen:</strong> Instellingen → Back-up &amp; synchronisatie → Exporteren.
              Je krijgt alles als één JSON-bestand.
            </li>
            <li>
              <strong>Verwijderen:</strong> Instellingen → Account &amp; synchronisatie → Account
              verwijderen.
            </li>
          </ul>
          <p className="mt-2">
            Ben je het ergens niet mee eens, dan mag je een klacht indienen bij de Autoriteit
            Persoonsgegevens.
          </p>
        </Section>

        <Section title="👶 Leeftijd">
          <p>
            Ben je jonger dan 16, vraag dan even toestemming aan je ouder of verzorger voordat je
            een account aanmaakt.
          </p>
        </Section>

        <div className="card px-5 py-4">
          <Link href="/instellingen" className="text-sm">
            &larr; Terug naar Instellingen
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card px-5 py-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {children}
      </div>
    </section>
  );
}
