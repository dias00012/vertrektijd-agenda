"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, isSyncConfigured } from "@/lib/supabase";

interface AuthResult {
  ok: boolean;
  /** Nederlandse foutmelding wanneer `ok` false is. */
  error?: string;
  /** true bij registratie wanneer er nog een e-mail bevestigd moet worden. */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  /** Of synchronisatie überhaupt is ingesteld (env-variabelen aanwezig). */
  configured: boolean;
  /** false zolang de sessie nog wordt geladen. */
  ready: boolean;
  user: User | null;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Stuurt een herstelmail met een link waarmee je een nieuw wachtwoord kiest. */
  resetPassword: (email: string) => Promise<AuthResult>;
  /** Zet een nieuw wachtwoord voor de sessie die uit de herstelmail komt. */
  updatePassword: (password: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Vertaalt bekende Supabase-foutmeldingen naar begrijpelijk Nederlands. */
function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mailadres of wachtwoord klopt niet.";
  if (m.includes("already registered") || m.includes("already exists"))
    return "Er bestaat al een account met dit e-mailadres. Log in.";
  if (m.includes("password") && m.includes("6"))
    return "Kies een wachtwoord van minstens 6 tekens.";
  if (m.includes("email") && m.includes("valid")) return "Vul een geldig e-mailadres in.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Te veel pogingen. Wacht even en probeer opnieuw.";
  if (m.includes("email logins are disabled") || m.includes("signups not allowed"))
    return "Inloggen met e-mail staat nog uit voor deze app. De beheerder moet e-mail als inlogmethode aanzetten.";
  if (m.includes("email not confirmed"))
    return "Bevestig eerst je e-mailadres via de link in je mailbox.";
  if (m.includes("same password") || m.includes("should be different"))
    return "Kies een ander wachtwoord dan je vorige.";
  return message;
}

/** Waar de link uit een herstelmail op moet uitkomen. */
function resetRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/wachtwoord`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!isSyncConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: "Synchronisatie is niet ingesteld." };
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { ok: false, error: translateError(error.message) };
      // Bij verplichte e-mailbevestiging is er nog geen sessie.
      return { ok: true, needsConfirmation: !data.session };
    },
    [supabase],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: "Synchronisatie is niet ingesteld." };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: translateError(error.message) };
      return { ok: true };
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  const resetPassword = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: "Synchronisatie is niet ingesteld." };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirectUrl(),
      });
      if (error) return { ok: false, error: translateError(error.message) };
      return { ok: true };
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, error: "Synchronisatie is niet ingesteld." };
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { ok: false, error: translateError(error.message) };
      return { ok: true };
    },
    [supabase],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSyncConfigured,
      ready,
      user,
      signUp,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [ready, user, signUp, signIn, signOut, resetPassword, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth moet binnen een <AuthProvider> gebruikt worden.");
  return context;
}
