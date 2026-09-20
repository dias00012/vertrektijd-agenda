"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Wat een venster nodig heeft om ook zonder muis te werken.
 *
 * Vier dingen, en ze hoorden bij elkaar terwijl ze los geregeld waren: van de
 * zeven vensters in de app reageerden er drie op Escape, zette er één de focus
 * naar binnen, hield er geen enkele de focus vast en bracht er geen enkele hem
 * terug. Dat laatste is het vervelendst: je sluit een venster en staat weer
 * bovenaan de pagina, terwijl je net bij die ene opdracht was.
 *
 * De focusval is geen luxe bij een venster met `aria-modal`: dat attribuut
 * zegt tegen een schermlezer dat de rest van de pagina er niet is, maar houdt
 * Tab niet tegen. Zonder val loop je dus met Tab een pagina in die volgens de
 * app niet bestaat.
 */

/** Alles wat focus kan krijgen en dat nu ook mag. */
const FOCUSBAAR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusbareIn(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(FOCUSBAAR)].filter(
    // Een verborgen veld telt niet mee; `offsetParent` is null zodra iets
    // `display: none` heeft of in een dichtgeklapt deel zit.
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useDialog(
  dialog: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: { lockScroll?: boolean } = {},
): void {
  const { lockScroll = true } = options;
  /** Waar de focus vandaan kwam, zodat hij daar weer heen kan. */
  const herkomst = useRef<HTMLElement | null>(null);

  useEffect(() => {
    herkomst.current = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    if (element) focusbareIn(element)[0]?.focus();

    return () => {
      // Alleen terugzetten als het element er nog is; een knop die met het
      // venster verdween zou een fout geven.
      const terug = herkomst.current;
      if (terug && document.contains(terug)) terug.focus();
    };
  }, [dialog]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const element = dialog.current;
      if (!element) return;
      const velden = focusbareIn(element);
      if (velden.length === 0) {
        // Niets om heen te tabben: dan blijft de focus waar hij is in plaats
        // van achter het venster te belanden.
        event.preventDefault();
        return;
      }

      const eerste = velden[0];
      const laatste = velden[velden.length - 1];
      const actief = document.activeElement;

      if (event.shiftKey && (actief === eerste || !element.contains(actief))) {
        event.preventDefault();
        laatste.focus();
      } else if (!event.shiftKey && actief === laatste) {
        event.preventDefault();
        eerste.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog, onClose]);

  useEffect(() => {
    if (!lockScroll) return;
    const vorige = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = vorige;
    };
  }, [lockScroll]);
}
