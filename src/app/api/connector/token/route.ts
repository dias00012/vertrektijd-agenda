import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { say } from "@/lib/server/language";
import { checkRateLimit, clientKey } from "@/lib/server/rateLimit";
import { createConnectorToken, hashConnectorToken } from "@/lib/connectorToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De connector-tokens van de ingelogde gebruiker beheren.
 *
 *   GET    — welke er zijn (naam, datum, laatst gebruikt). Nooit het token zelf.
 *   POST   — een nieuwe aanmaken. Dit is het enige moment waarop de leesbare
 *            vorm bestaat; daarna staat er alleen nog een hash.
 *   DELETE — er een intrekken.
 *
 * Wie je bent blijkt uit je eigen Supabase-sessie, net als bij het verwijderen
 * van een account. Nooit uit een id in de body: dan kon je andermans agenda
 * openzetten.
 */

/** De ingelogde gebruiker, of een antwoord dat verteld wat eraan schort. */
async function requireUser(
  request: Request,
): Promise<{ admin: SupabaseClient; userId: string } | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: say(request, "api.connectorOff") }, { status: 501 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: say(request, "api.notLoggedIn") }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: say(request, "api.sessionExpired") }, { status: 401 });
  }

  return { admin, userId: data.user.id };
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.admin
    .from("connector_tokens")
    .select("token_hash, label, created_at, last_used_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/connector/token] list", error);
    return NextResponse.json({ error: say(request, "api.connectorFailed") }, { status: 500 });
  }

  return NextResponse.json({
    tokens: (data ?? []).map((row) => ({
      // De hash is de handgreep waarmee je hem later intrekt. Hij verraadt het
      // token niet: je kunt er niet mee terugrekenen.
      id: row.token_hash,
      label: row.label,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    })),
  });
}

export async function POST(request: Request) {
  // Streng: één sleutel per apparaat is genoeg, en wie er honderd aanmaakt is
  // iets anders aan het doen dan zijn agenda plannen.
  const limit = checkRateLimit(`connector-token:${clientKey(request)}`, {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: say(request, "api.connectorTooMany") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  let label = "";
  try {
    const body = (await request.json()) as { label?: unknown };
    if (typeof body.label === "string") label = body.label.trim().slice(0, 60);
  } catch {
    // Geen body is prima; dan blijft de naam leeg.
  }

  const token = createConnectorToken();
  const { error } = await auth.admin.from("connector_tokens").insert({
    token_hash: hashConnectorToken(token),
    user_id: auth.userId,
    label,
  });

  if (error) {
    console.error("[api/connector/token] create", error);
    return NextResponse.json({ error: say(request, "api.connectorFailed") }, { status: 500 });
  }

  // De enige keer dat dit token bestaat in leesbare vorm.
  return NextResponse.json({ token });
}

export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  let id = "";
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id === "string") id = body.id;
  } catch {
    // Valt hieronder door de lege-id-controle.
  }
  if (!id) {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  // Ook op user_id filteren: zo kan niemand met andermans hash iets intrekken.
  const { error } = await auth.admin
    .from("connector_tokens")
    .delete()
    .eq("token_hash", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[api/connector/token] delete", error);
    return NextResponse.json({ error: say(request, "api.connectorFailed") }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
