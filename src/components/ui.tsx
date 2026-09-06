"use client";

import type { ReactNode } from "react";
import { useT } from "@/hooks/useLanguage";

/** Kleine, gedeelde UI-bouwstenen. */

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px solid color-mix(in srgb, currentColor 25%, transparent)",
          borderTopColor: "currentColor",
          display: "inline-block",
          animation: "spin 700ms linear infinite",
        }}
      />
      {label ? <span className="text-xs">{label}</span> : <span className="sr-only">{t("ui.busy")}</span>}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span aria-hidden className="text-4xl">
        {icon}
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-xs text-sm" style={{ color: "var(--muted)" }}>
        {description}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const t = useT();
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-xs"
      style={{ color: "var(--danger)" }}
      role="alert"
    >
      <span>⚠️ {children}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          {t("common.retry")}
        </button>
      ) : null}
    </p>
  );
}
