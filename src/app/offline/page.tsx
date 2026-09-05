import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Geen verbinding — Vertrektijd",
};

/**
 * Wat je ziet als je een pagina opent die nog niet in de cache staat terwijl je
 * geen bereik hebt. Bewust geruststellend: je gegevens staan op je apparaat en
 * zijn niet weg.
 */
export default function OfflinePage() {
  return (
    <div className="card px-5 py-8 text-center">
      <p aria-hidden className="text-3xl">
        📡
      </p>
      <h1 className="mt-2 text-lg font-semibold">Even geen verbinding</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        Deze pagina is nog niet opgeslagen op je apparaat. Je agenda zelf staat er wél op — open
        Vandaag of Agenda en je ziet je planning gewoon.
      </p>
      <p className="mx-auto mt-3 max-w-sm text-xs" style={{ color: "var(--muted)" }}>
        Nieuwe reistijden en live vertragingen komen terug zodra je weer bereik hebt.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          Naar Vandaag
        </Link>
        <Link href="/agenda" className="btn btn-ghost">
          Naar Agenda
        </Link>
      </div>
    </div>
  );
}
