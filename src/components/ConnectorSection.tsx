"use client";

import { useCallback, useEffect, useState } from "react";
import { headers } from "@/lib/api";
import { useT } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/lib/supabase";
import { formatDateShort } from "@/lib/time";
import { Spinner } from "./ui";
import { SettingsRow } from "./SettingsRow";

/**
 * De Claude-connector: sleutels aanmaken en intrekken.
 *
 * Eén ding maakt dit scherm anders dan de rest van de instellingen: de sleutel
 * bestaat maar één keer in leesbare vorm, hier op dit scherm. Daarna staat er
 * alleen nog een hash in de database. Vandaar de nadruk op kopiëren, en vandaar
 * dat "kwijt" hier geen ramp is maar gewoon: maak een nieuwe.
 */

interface TokenRow {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function ConnectorSection() {
  const { configured, user } = useAuth();
  const t = useT();

  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** De sessie-token waarmee we ons bij onze eigen server melden. */
  const authHeader = useCallback(async (): Promise<Record<string, string> | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, []);

  const load = useCallback(async () => {
    const auth = await authHeader();
    if (!auth) return;
    try {
      const response = await fetch("/api/connector/token", { headers: headers(auth) });
      if (!response.ok) return;
      const payload = (await response.json()) as { tokens?: TokenRow[] };
      setTokens(payload.tokens ?? []);
    } catch {
      // Offline: dan blijft de lijst leeg tot de volgende keer. Geen melding,
      // want er is hier niets kapot en niets te doen.
    }
  }, [authHeader]);

  useEffect(() => {
    if (user) void load();
    else setTokens(null);
  }, [user, load]);

  async function create() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const auth = await authHeader();
      if (!auth) {
        setError(t("account.sessionExpired"));
        return;
      }
      const response = await fetch("/api/connector/token", {
        method: "POST",
        headers: headers(auth),
        body: JSON.stringify({ label }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !payload.token) {
        setError(payload.error ?? t("connector.failed"));
        return;
      }
      setFresh(payload.token);
      setCopied(false);
      setLabel("");
      await load();
    } catch {
      setError(t("connector.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    setNotice(null);
    try {
      const auth = await authHeader();
      if (!auth) {
        setError(t("account.sessionExpired"));
        return;
      }
      const response = await fetch("/api/connector/token", {
        method: "DELETE",
        headers: headers(auth),
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        setError(t("connector.failed"));
        return;
      }
      setNotice(t("connector.revoked"));
      await load();
    } catch {
      setError(t("connector.failed"));
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Zonder klembordrechten blijft de sleutel gewoon leesbaar op het scherm
      // staan; dan selecteer je hem zelf.
    }
  }

  const summary = !configured || !user
    ? t("connector.summaryOff")
    : tokens === null || tokens.length === 0
      ? t("connector.summaryNone")
      : tokens.length === 1
        ? t("connector.summaryOne")
        : t("connector.summaryMany", { count: tokens.length });

  // Het adres dat in Claude moet: precies deze app, dus af te lezen van waar we
  // draaien. Op de server is `window` er nog niet; dan laten we het leeg tot de
  // eerste tekening in de browser.
  const endpoint = typeof window === "undefined" ? "" : `${window.location.origin}/api/mcp`;

  return (
    <SettingsRow icon={"\u{1F517}"} title={t("connector.title")} summary={summary}>
      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {t("connector.intro")}
      </p>

      {!configured || !user ? (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {t("connector.needsAccount")}
        </p>
      ) : (
        <>
          <div className="mt-3">
            <label className="label" htmlFor="connector-label">
              {t("connector.labelPlaceholder")}
            </label>
            <input
              id="connector-label"
              className="input"
              value={label}
              maxLength={60}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("connector.labelPlaceholder")}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
              {busy ? <Spinner label={t("connector.creating")} /> : t("connector.create")}
            </button>
          </div>

          {fresh && (
            <div
              className="mt-3 rounded-xl border p-3"
              style={{ borderColor: "var(--line)" }}
            >
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {t("connector.once")}
              </p>
              <code className="mt-2 block break-all text-xs">{fresh}</code>
              <button
                type="button"
                className="btn btn-ghost mt-2"
                onClick={() => void copy(fresh)}
              >
                {copied ? t("connector.copied") : t("connector.copy")}
              </button>
            </div>
          )}

          <div className="mt-3">
            <p className="label">{t("connector.url")}</p>
            <code className="block break-all text-xs">{endpoint}</code>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {t("connector.howto")}
            </p>
          </div>

          {tokens && tokens.length > 0 && (
            <ul className="mt-3 space-y-2">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {token.label || formatDateShort(token.createdAt.slice(0, 10))}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      {token.lastUsedAt
                        ? t("connector.lastUsed", {
                            when: formatDateShort(token.lastUsedAt.slice(0, 10)),
                          })
                        : t("connector.never")}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger shrink-0"
                    onClick={() => void revoke(token.id)}
                  >
                    {t("connector.revoke")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {notice && (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
        </>
      )}
    </SettingsRow>
  );
}
