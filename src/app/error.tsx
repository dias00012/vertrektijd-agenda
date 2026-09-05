"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

/**
 * Vangt een fout in een pagina op. Zonder dit ziet iemand een leeg wit scherm
 * en weet hij niet of zijn agenda weg is.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="card px-5 py-8 text-center">
      <p aria-hidden className="text-3xl">
        ⚠️
      </p>
      <h1 className="mt-2 text-lg font-semibold">Er ging iets mis</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        Deze pagina kon niet worden geladen. Je agenda staat veilig op je apparaat en in je
        account. Er is niets weg.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Opnieuw proberen
        </button>
        <a href="/" className="btn btn-ghost">
          Naar Vandaag
        </a>
      </div>
      {error.digest ? (
        <p className="mt-4 text-[0.7rem]" style={{ color: "var(--muted)" }}>
          Foutcode: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
