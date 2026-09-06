"use client";

import Link from "next/link";
import { useT } from "@/hooks/useLanguage";

/** Pagina bestaat niet, bijvoorbeeld na een oude link uit een e-mail. */
export default function NotFound() {
  const t = useT();

  return (
    <div className="card px-5 py-8 text-center">
      <p aria-hidden className="text-3xl">
        🧭
      </p>
      <h1 className="mt-2 text-lg font-semibold">{t("notFound.title")}</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        {t("notFound.body")}
      </p>
      <div className="mt-4">
        <Link href="/" className="btn btn-primary">
          {t("error.toToday")}
        </Link>
      </div>
    </div>
  );
}
