"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useAgenda } from "@/hooks/useAgenda";
import { getSupabase } from "@/lib/supabase";
import { Spinner } from "./ui";

/**
 * Account & synchronisatie: inloggen of registreren met e-mail + wachtwoord.
 * Ingelogd wordt je agenda, schoolwerk en instellingen bewaard in je account en
 * gedeeld tussen je apparaten. Zonder account werkt de app gewoon lokaal.
 */
export function AccountSection() {
  const { configured, ready, user, signIn, signUp, signOut, resetPassword } = useAuth();
  const { sync } = useAgenda();

  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Twee stappen, want een account verwijderen kun je niet terugdraaien. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    const supabase = getSupabase();
    if (!supabase) return;

    setError(null);
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Je sessie is verlopen. Log opnieuw in en probeer het nog eens.");
        return;
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Het account kon niet worden verwijderd.");
        return;
      }

      await signOut();
      setConfirmDelete(false);
      setNotice("Je account en alle gegevens erin zijn verwijderd.");
    } catch {
      setError("Het account kon niet worden verwijderd. Controleer je internetverbinding.");
    } finally {
      setDeleting(false);
    }
  }

  // Synchronisatie is (nog) niet ingesteld: alleen relevant voordat de
  // beheerder de sleutels heeft toegevoegd. De app werkt lokaal gewoon door.
  if (!configured) {
    return (
      <section className="card mt-4 px-5 py-5">
        <h2 className="text-base font-semibold">&#128100; Account &amp; synchronisatie</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          Synchronisatie is nog niet ingesteld. Je gegevens staan lokaal op dit apparaat. Zodra
          accounts zijn geactiveerd kun je hier inloggen om je agenda tussen apparaten te delen.
        </p>
      </section>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const result =
      mode === "login"
        ? await signIn(email, password)
        : mode === "signup"
          ? await signUp(email, password)
          : await resetPassword(email);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Er ging iets mis.");
      return;
    }
    if (mode === "reset") {
      // Bewust geen onderscheid tussen wel/niet bestaande accounts: dat zou
      // verklappen wie hier een account heeft.
      setNotice(
        "Als er een account is met dit e-mailadres, staat er een herstelmail in je mailbox. Kijk ook even in je spam.",
      );
      setMode("login");
      return;
    }
    if (result.needsConfirmation) {
      setNotice(
        "Account aangemaakt. Bevestig je e-mailadres via de link die we je hebben gestuurd en log daarna in.",
      );
      setMode("login");
      setPassword("");
    }
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128100; Account &amp; synchronisatie</h2>

      {!ready ? (
        <div className="mt-3">
          <Spinner size={16} label="Laden…" />
        </div>
      ) : user ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            Ingelogd als <strong>{user.email}</strong>
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {sync.status === "syncing"
              ? "↻ Bezig met synchroniseren…"
              : sync.status === "error"
                ? `⚠️ Synchroniseren mislukt: ${sync.error ?? ""}`
                : "✓ Je agenda, schoolwerk en instellingen worden bewaard in je account en gedeeld tussen je apparaten."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Uitloggen
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmDelete(true);
                  setError(null);
                }}
              >
                Account verwijderen
              </button>
            ) : null}
          </div>

          {confirmDelete ? (
            <div
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
                Weet je het zeker?
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Je account, je agenda, je schoolwerk en je locaties worden definitief verwijderd.
                Dit kan niet ongedaan worden gemaakt. Wil je je gegevens bewaren, exporteer ze dan
                eerst hieronder bij Back-up.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void deleteAccount()}
                  disabled={deleting}
                >
                  {deleting ? <Spinner size={16} /> : "Ja, verwijder mijn account"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
              &#9888;&#65039; {error}
            </p>
          ) : null}

          <PrivacyLink />
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {mode === "reset"
              ? "Vul je e-mailadres in. We sturen je een link waarmee je een nieuw wachtwoord kiest."
              : "Log in om je agenda en schoolwerk te bewaren en op al je apparaten hetzelfde te hebben. Nog geen account? Maak er gratis een aan."}
          </p>

          <div
            className="mt-3 flex rounded-xl border p-0.5"
            style={{ borderColor: "var(--line)" }}
            role="group"
            aria-label="Inloggen of registreren"
          >
            {(
              [
                { id: "login", label: "Inloggen" },
                { id: "signup", label: "Account aanmaken" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={mode === option.id}
                onClick={() => {
                  setMode(option.id);
                  setError(null);
                  setNotice(null);
                }}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: mode === option.id ? "var(--surface-soft)" : "transparent",
                  color: mode === option.id ? "var(--ink)" : "var(--muted)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="account-email">
                E-mailadres
              </label>
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {/* Bij "wachtwoord vergeten" is je e-mailadres genoeg. */}
            {mode !== "reset" ? (
              <div>
                <label className="label" htmlFor="account-password">
                  Wachtwoord
                </label>
                <input
                  id="account-password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                {mode === "signup" ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    Minstens 6 tekens.
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
                &#9888;&#65039; {error}
              </p>
            ) : null}
            {notice ? (
              <p className="text-sm" style={{ color: "var(--accent)" }} role="status">
                {notice}
              </p>
            ) : null}

            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy}>
              {busy ? (
                <Spinner size={16} />
              ) : mode === "login" ? (
                "Inloggen"
              ) : mode === "signup" ? (
                "Account aanmaken"
              ) : (
                "Stuur herstelmail"
              )}
            </button>

            {mode === "login" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError(null);
                  setNotice(null);
                }}
                className="block text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                Wachtwoord vergeten?
              </button>
            ) : mode === "reset" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setNotice(null);
                }}
                className="block text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                &larr; Terug naar inloggen
              </button>
            ) : null}
          </form>

          <PrivacyLink />
        </>
      )}
    </section>
  );
}

/** Waar je gegevens blijven — hoort zichtbaar te zijn waar je je account maakt. */
function PrivacyLink() {
  return (
    <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
      Wat we bewaren en hoe je het weghaalt staat in de{" "}
      <Link href="/privacy" style={{ color: "var(--accent)" }}>
        privacyverklaring
      </Link>
      .
    </p>
  );
}
