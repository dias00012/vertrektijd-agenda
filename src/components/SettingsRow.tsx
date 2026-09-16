"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

/**
 * Eén instelling als rij: titel, wat er nu staat, en de bediening pas als je
 * hem opent.
 *
 * Instellingen zijn dingen die je één keer goed zet en daarna nog hooguit eens
 * per maand aanraakt. Stonden ze allemaal open, dan zocht je elke keer opnieuw
 * naar die ene regel tussen een scherm vol knoppen. Dicht zie je de hele lijst
 * in één blik, en onder elke titel staat het antwoord dat je meestal komt
 * halen — je thuisadres, hoeveel marge, staan de meldingen aan — zonder dat je
 * ergens op hoeft te klikken.
 *
 * Het paneel blijft in de pagina staan (`hidden`) in plaats van weg te vallen:
 * zo raak je een half ingetypte link niet kwijt als je hem even dichtklapt.
 */
export function SettingsRow({
  icon,
  title,
  summary,
  attention,
  openWhen,
  children,
}: {
  /** Alleen ter herkenning; een schermlezer slaat hem over. */
  icon: string;
  title: string;
  /** Wat hier nu staat, in een paar woorden. */
  summary?: ReactNode;
  /** Rood: de app kan niet zonder, en het is nog leeg. */
  attention?: boolean;
  /** Meteen open. Voor een instelling die echt om aandacht vraagt. */
  openWhen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();

  // Pas als de gegevens geladen zijn weten we of er iets ontbreekt, vandaar een
  // effect en geen beginwaarde. Zelf weer dichtklappen doen we nooit: dan zou
  // het paneel onder je handen wegvallen terwijl je er iets invult.
  useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);

  return (
    <div className="settings-row">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((value) => !value)}
          className="settings-row-button flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base"
            style={{ background: "var(--surface-soft)" }}
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{title}</span>
            {summary ? (
              <span
                className="mt-0.5 block truncate text-xs"
                style={{ color: attention ? "var(--danger)" : "var(--muted)" }}
              >
                {summary}
              </span>
            ) : null}
          </span>
          <Chevron open={open} />
        </button>
      </h3>
      <div id={panel} hidden={!open} className="px-4 pb-5">
        {children}
      </div>
    </div>
  );
}

/** Een groep rijen onder één kopje, als één kaart. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2
        className="mb-2 px-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--muted)" }}
      >
        {title}
      </h2>
      <div className="card overflow-hidden">{children}</div>
    </section>
  );
}

/** Het pijltje dat omklapt als de rij openstaat. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 transition-transform duration-150"
      style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "none" }}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
