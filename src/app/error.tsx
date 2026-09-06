"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/monitoring";
import { useT } from "@/hooks/useLanguage";

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
  const t = useT();

  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="card px-5 py-8 text-center">
      <p aria-hidden className="text-3xl">
        ⚠️
      </p>
      <h1 className="mt-2 text-lg font-semibold">{t("error.title")}</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        {t("error.body")}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t("common.retry")}
        </button>
        <Link href="/" className="btn btn-ghost">
          {t("error.toToday")}
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-4 text-[0.7rem]" style={{ color: "var(--muted)" }}>
          {t("error.code", { digest: error.digest })}
        </p>
      ) : null}
    </div>
  );
}
