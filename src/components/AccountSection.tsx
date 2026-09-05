"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAgenda } from "@/hooks/useAgenda";
import { Spinner } from "./ui";

/**
 * Account & synchronisatie: inloggen of registreren met e-mail + wachtwoord.
 * Ingelogd wordt je agenda, schoolwerk en instellingen bewaard in je account en
 * gedeeld tussen je apparaten. Zonder account werkt de app gewoon lokaal.
 */
export function AccountSection() {
  const { configured, ready, user, signIn, signUp, signOut } = useAuth();
  const { sync } = useAgenda();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      mode === "login" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Er ging iets mis.");
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
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Uitloggen
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            Log in om je agenda en schoolwerk te bewaren en op al je apparaten hetzelfde te
            hebben. Nog geen account? Maak er gratis een aan.
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
              ) : (
                "Account aanmaken"
              )}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
