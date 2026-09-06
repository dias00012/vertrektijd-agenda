"use client";

import { useState } from "react";
import { useT } from "@/hooks/useLanguage";
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
  const t = useT();

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
        setError(t("account.sessionExpired"));
        return;
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? t("account.deleteFailed"));
        return;
      }

      await signOut();
      setConfirmDelete(false);
      setNotice(t("account.deleted"));
    } catch {
      setError(t("account.deleteOffline"));
    } finally {
      setDeleting(false);
    }
  }

  // Synchronisatie is (nog) niet ingesteld: alleen relevant voordat de
  // beheerder de sleutels heeft toegevoegd. De app werkt lokaal gewoon door.
  if (!configured) {
    return (
      <section className="card mt-4 px-5 py-5">
        <h2 className="text-base font-semibold">&#128100; {t("account.title")}</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {t("account.notConfigured")}
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
      setError(result.error ?? t("account.somethingWrong"));
      return;
    }
    if (mode === "reset") {
      // Bewust geen onderscheid tussen wel/niet bestaande accounts: dat zou
      // verklappen wie hier een account heeft.
      setNotice(t("account.resetSent"));
      setMode("login");
      return;
    }
    if (result.needsConfirmation) {
      setNotice(t("account.created"));
      setMode("login");
      setPassword("");
    }
  }

  return (
    <section className="card mt-4 px-5 py-5">
      <h2 className="text-base font-semibold">&#128100; {t("account.title")}</h2>

      {!ready ? (
        <div className="mt-3">
          <Spinner size={16} label={t("common.loading")} />
        </div>
      ) : user ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            {t("account.loggedInAs")} <strong>{user.email}</strong>
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {sync.status === "syncing"
              ? `↻ ${t("account.syncing")}`
              : sync.status === "error"
                ? `⚠️ ${t("account.syncFailed", { error: sync.error ?? "" })}`
                : `✓ ${t("account.syncOk")}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              {t("account.logout")}
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
                {t("account.delete")}
              </button>
            ) : null}
          </div>

          {confirmDelete ? (
            <div
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
                {t("account.deleteSure")}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {t("account.deleteBody")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void deleteAccount()}
                  disabled={deleting}
                >
                  {deleting ? <Spinner size={16} /> : t("account.deleteConfirm")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  {t("common.cancel")}
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
              ? t("account.resetIntro")
              : t("account.loginIntro")}
          </p>

          <div
            className="mt-3 flex rounded-xl border p-0.5"
            style={{ borderColor: "var(--line)" }}
            role="group"
            aria-label={t("account.loginOrRegister")}
          >
            {(
              [
                { id: "login", key: "account.login" },
                { id: "signup", key: "account.register" },
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
                {t(option.key)}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="account-email">
                {t("account.email")}
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
                  {t("account.password")}
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
                    {t("account.minChars")}
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
                t("account.login")
              ) : mode === "signup" ? (
                t("account.register")
              ) : (
                t("account.sendReset")
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
                {t("account.forgot")}
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
                &larr; {t("account.backToLogin")}
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
  const t = useT();
  return (
    <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
      {t("account.privacyIntro")}{" "}
      <Link href="/privacy" style={{ color: "var(--accent)" }}>
        {t("account.privacyLink")}
      </Link>
      .
    </p>
  );
}
