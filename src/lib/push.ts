"use client";

import { getLanguage } from "./i18n/locale";

/**
 * Meldingen ook als de app dicht is.
 *
 * De opzet is bewust zo dat de server je agenda nooit te zien krijgt. Jouw
 * telefoon rekent zelf uit wanneer je moet vertrekken en zet kant-en-klare
 * berichten in een wachtrij: "stuur deze tekst om 07:04". De server kent
 * alleen een tijdstip en een zin, niet waar je heen gaat of met wie.
 *
 * Gevolg van die keuze: de wachtrij loopt leeg. Open je de app een week lang
 * niet, dan stoppen de meldingen tot je hem weer opent. Dat is de prijs, en
 * die is het waard.
 */

/** Onder deze sleutel staat het willekeurige id van dit apparaat. */
const DEVICE_KEY = "agenda.push.device.v1";

/**
 * Zo lang wachten we op de service worker.
 *
 * `serviceWorker.ready` lost nooit op wanneer registreren mislukt, en tijdens
 * ontwikkelen registreren we hem bewust niet. Zonder deze grens blijft de
 * schakelaar in de instellingen eindeloos op "bezig" staan, zonder uitleg.
 */
const READY_TIMEOUT_MS = 5000;

/** De actieve service worker, of null als hij er binnen redelijke tijd niet is. */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/** Een id voor dit apparaat; puur willekeurig, aan niets anders gekoppeld. */
export function deviceId(): string {
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    // Privémodus: dan werkt het deze sessie, maar onthoudt hij niets.
    return crypto.randomUUID();
  }
}

/** Kan deze browser überhaupt meldingen ontvangen met de app dicht? */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/** De publieke VAPID-sleutel omzetten naar de vorm die de browser wil. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", "X-Language": getLanguage() };
}

export interface QueuedMessage {
  /** ISO-tijdstip waarop het bericht verstuurd moet worden. */
  sendAt: string;
  title: string;
  body: string;
}

/**
 * Meldt dit apparaat aan. Geeft `false` terug wanneer de gebruiker weigert of
 * de browser het niet aankan; dan blijft alles bij de meldingen in de app zelf.
 */
export async function enablePush(): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!pushSupported() || !key) return false;

  if (Notification.permission !== "granted") {
    const answer = await Notification.requestPermission();
    if (answer !== "granted") return false;
  }

  const registration = await readyRegistration();
  if (!registration) return false;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ device: deviceId(), subscription: subscription.toJSON() }),
  });
  return response.ok;
}

/** Meldt dit apparaat af en gooit de wachtrij weg. */
export async function disablePush(): Promise<void> {
  try {
    const registration = await readyRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Alsnog afmelden bij de server: dan komt er in elk geval niets meer.
  }
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: headers(),
    body: JSON.stringify({ device: deviceId() }),
  }).catch(() => undefined);
}

/** Staat dit apparaat aangemeld? */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") return false;
  const registration = await readyRegistration();
  if (!registration) return false;
  try {
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Vervangt de wachtrij van dit apparaat door deze berichten.
 *
 * Geeft terug of het lukte. Dat werd eerder genegeerd, dus een server die 502
 * gaf leek geslaagd: de app dacht dat de meldingen klaarstonden en probeerde
 * het nooit opnieuw.
 */
export async function replaceQueue(messages: QueuedMessage[]): Promise<boolean> {
  try {
    const response = await fetch("/api/push/schedule", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ device: deviceId(), messages }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Meldt het huidige abonnement opnieuw aan bij de server.
 *
 * Nodig omdat de server een apparaat opruimt zodra de pushdienst zegt dat het
 * abonnement verlopen is. De browser merkt daar niets van en bleef "aan"
 * tonen, terwijl er nooit meer een melding kwam.
 */
export async function refreshSubscription(): Promise<void> {
  const registration = await readyRegistration();
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return;

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ device: deviceId(), subscription: subscription.toJSON() }),
  }).catch(() => undefined);
}
