"use client";

import { useEffect } from "react";
import { installGlobalErrorReporting } from "@/lib/monitoring";

/**
 * Registreert de service worker (zodat de app ook zonder bereik opent) en zet
 * de foutmelding aan. Beide horen bij het opstarten en hebben geen eigen UI.
 * Alleen in productie: tijdens ontwikkelen zou een gecachte versie je
 * wijzigingen verbergen.
 */
export function ServiceWorker() {
  useEffect(() => {
    installGlobalErrorReporting();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Zonder service worker werkt de app gewoon, alleen niet offline.
      });
    };

    // Pas na het laden: registreren mag de eerste weergave niet vertragen.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
