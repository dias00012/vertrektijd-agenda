"use client";

import Link from "next/link";
import { useT } from "@/hooks/useLanguage";
import { SettingsRow } from "./SettingsRow";

/**
 * Uitleg bij het vertrekscherm en het beginscherm.
 *
 * Staat er omdat niemand uit zichzelf op "Zet op beginscherm" klikt, en omdat
 * de vraag "waarom heeft deze app geen widget" een eerlijk antwoord verdient:
 * dat mag een webapp niet, en dit is wat er wel kan.
 */
export function HomeScreenSection() {
  const t = useT();

  return (
    <SettingsRow
      icon={"\u{1F4F1}"}
      title={t("homescreen.title")}
      summary={t("homescreen.summary")}
    >
      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("homescreen.body")}
      </p>

      <Link href="/widget" className="btn btn-primary mt-3 no-underline">
        &#9200; {t("homescreen.open")}
      </Link>

      <dl className="mt-4 space-y-3 text-xs leading-relaxed">
        <div>
          <dt className="font-semibold">&#127822; {t("homescreen.ios.title")}</dt>
          <dd className="mt-0.5" style={{ color: "var(--muted)" }}>
            {t("homescreen.ios.body")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">&#129302; {t("homescreen.android.title")}</dt>
          <dd className="mt-0.5" style={{ color: "var(--muted)" }}>
            {t("homescreen.android.body")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">&#128290; {t("homescreen.badge.title")}</dt>
          <dd className="mt-0.5" style={{ color: "var(--muted)" }}>
            {t("homescreen.badge.body")}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[0.7rem] leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("homescreen.limits")}
      </p>
    </SettingsRow>
  );
}
