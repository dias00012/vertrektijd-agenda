import { NextResponse } from "next/server";
import { say } from "@/lib/server/language";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete — verwijdert het account van de ingelogde gebruiker.
 *
 * De AVG geeft iedereen het recht om vergeten te worden, dus dit moet met één
 * knop kunnen. Verwijderen van een account kan alleen met de service-sleutel,
 * en die mag nooit in de browser komen — vandaar deze route.
 *
 * De aanvrager bewijst wie hij is met zijn eigen access token; we verwijderen
 * uitsluitend dát account. De agenda-rij verdwijnt automatisch mee
 * (`on delete cascade` in het schema).
 */
export async function POST(request: Request) {
  // Streng: dit is een onomkeerbare actie, niemand hoeft dit vaak te doen.
  const limit = checkRateLimit(`account-delete:${clientKey(request)}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: say(request, "api.deleteTooMany") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        error: say(request, "api.deleteNotConfigured"),
      },
      { status: 501 },
    );
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: say(request, "api.notLoggedIn") }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Het token bepaalt wie er verwijderd wordt — nooit een id uit de body,
  // want dan zou iemand andermans account kunnen wissen.
  const { data, error: lookupError } = await admin.auth.getUser(token);
  if (lookupError || !data.user) {
    return NextResponse.json({ error: say(request, "api.sessionExpired") }, { status: 401 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error("[api/account/delete]", deleteError);
    return NextResponse.json(
      { error: say(request, "api.deleteFailed") },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
