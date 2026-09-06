"use client";

import Link from "next/link";
import { useT } from "@/hooks/useLanguage";

/**
 * Privacyverklaring. Zodra andere mensen een account aanmaken bewaar je hun
 * e-mailadres, thuisadres en agenda: persoonsgegevens onder de AVG. Dan moet
 * ergens staan wát je bewaart, waarom, en hoe iemand dat weer weg krijgt.
 */
export function PrivacyStatement() {
  const t = useT();

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("privacy.title")}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("privacy.subtitle")}
        </p>
      </header>

      <div className="space-y-4">
        <Section title={`🔒 ${t("privacy.local.title")}`}>
          <p>{t("privacy.local.body")}</p>
        </Section>

        <Section title={`👤 ${t("privacy.account.title")}`}>
          <p>{t("privacy.account.intro")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>{t("privacy.account.email")}</strong>, {t("privacy.account.emailWhy")}
            </li>
            <li>
              <strong>{t("privacy.account.data")}</strong>, {t("privacy.account.dataWhy")}
            </li>
          </ul>
          <p className="mt-2">{t("privacy.account.where")}</p>
        </Section>

        <Section title={`🚆 ${t("privacy.outside.title")}`}>
          <p>{t("privacy.outside.intro")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>OpenStreetMap / Nominatim</strong>, {t("privacy.outside.nominatim")}
            </li>
            <li>
              <strong>OSRM</strong>, {t("privacy.outside.osrm")}
            </li>
            <li>
              <strong>transitous (MOTIS)</strong>, {t("privacy.outside.motis")}
            </li>
          </ul>
          <p className="mt-2">{t("privacy.outside.note")}</p>
        </Section>

        <Section title={`📅 ${t("privacy.calendars.title")}`}>
          <p>{t("privacy.calendars.body")}</p>
        </Section>

        <Section title={`🔔 ${t("privacy.push.title")}`}>
          <p>{t("privacy.push.body")}</p>
        </Section>

        <Section title={`📊 ${t("privacy.tracking.title")}`}>
          <p>{t("privacy.tracking.body")}</p>
          <p className="mt-2">{t("privacy.tracking.counters")}</p>
        </Section>

        <Section title={`⏳ ${t("privacy.retention.title")}`}>
          <p>{t("privacy.retention.body")}</p>
        </Section>

        <Section title={`🗑️ ${t("privacy.rights.title")}`}>
          <p>{t("privacy.rights.intro")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>{t("privacy.rights.export")}</strong> {t("privacy.rights.exportBody")}
            </li>
            <li>
              <strong>{t("privacy.rights.delete")}</strong> {t("privacy.rights.deleteBody")}
            </li>
          </ul>
          <p className="mt-2">{t("privacy.rights.complaint")}</p>
        </Section>

        <Section title={`👶 ${t("privacy.age.title")}`}>
          <p>{t("privacy.age.body")}</p>
        </Section>

        <div className="card px-5 py-4">
          <Link href="/instellingen" className="text-sm">
            &larr; {t("privacy.back")}
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
