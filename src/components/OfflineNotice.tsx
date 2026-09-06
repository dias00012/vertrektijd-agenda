"use client";

import Link from "next/link";
import { useT } from "@/hooks/useLanguage";

/**
 * Wat je ziet als je een pagina opent die nog niet in de cache staat terwijl je
 * geen bereik hebt. Bewust geruststellend: je gegevens staan op je apparaat en
 * zijn niet weg.
 */
export function OfflineNotice() {
  const t = useT();

  return (
    <div className="card px-5 py-8 text-center">
      <p aria-hidden className="text-3xl">
        📡
      </p>
      <h1 className="mt-2 text-lg font-semibold">{t("offline.title")}</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        {t("offline.body")}
      </p>
      <p className="mx-auto mt-3 max-w-sm text-xs" style={{ color: "var(--muted)" }}>
        {t("offline.note")}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          {t("error.toToday")}
        </Link>
        <Link href="/agenda" className="btn btn-ghost">
          {t("offline.toAgenda")}
        </Link>
      </div>
    </div>
  );
}
