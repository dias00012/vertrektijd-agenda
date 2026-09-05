"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui";

/**
 * Nieuw wachtwoord kiezen. Hier kom je terecht via de link uit de herstelmail:
 * die link logt je tijdelijk in, waarna je hier je nieuwe wachtwoord zet.
 */
export default function ResetPasswordPage() {
  const { configured, ready, user, updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // De link uit de mail komt binnen als #-fragment; supabase-js ruilt dat om
  // voor een sessie. Even geduld voordat we "log eerst in" durven te zeggen.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== repeat) {
      setError("De twee wachtwoorden zijn niet gelijk.");
      return;
    }

    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Het wachtwoord kon niet worden gewijzigd.");
      return;
    }
    setDone(true);
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Nieuw wachtwoord</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Kies een nieuw wachtwoord voor je account.
        </p>
      </header>

      <section className="card px-5 py-5">
        {!configured ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Accounts zijn voor deze app nog niet ingesteld.
          </p>
        ) : !ready || (!user && !waited) ? (
          <Spinner size={16} label="Even geduld…" />
        ) : done ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--accent)" }} role="status">
              &#10003; Je wachtwoord is gewijzigd. Je bent nu ingelogd.
            </p>
            <Link href="/" className="btn btn-primary inline-flex">
              Naar de agenda
            </Link>
          </div>
        ) : !user ? (
          <div className="space-y-3">
            <p className="text-sm">
              Deze link is verlopen of al gebruikt. Vraag een nieuwe herstelmail aan.
            </p>
            <Link href="/instellingen" className="btn btn-ghost inline-flex">
              Naar Instellingen
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="new-password">
                Nieuw wachtwoord
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className="field"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Minstens 6 tekens.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="repeat-password">
                Herhaal wachtwoord
              </label>
              <input
                id="repeat-password"
                type="password"
                autoComplete="new-password"
                className="field"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                required
                minLength={6}
              />
            </div>

            {error ? (
              <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
                &#9888;&#65039; {error}
              </p>
            ) : null}

            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy}>
              {busy ? <Spinner size={16} /> : "Wachtwoord opslaan"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
