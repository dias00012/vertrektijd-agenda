import { NextResponse } from "next/server";
import { say } from "@/lib/server/language";
import { checkRateLimit, clientKey } from "@/lib/server/rateLimit";
import { MAX_QUEUE, QUEUE_TABLE, adminClient, isDeviceId } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/push/schedule — vervangt de wachtrij van dit apparaat.
 *
 * De telefoon rekent zelf uit wanneer er iets moet komen en stuurt de zinnen
 * kant-en-klaar op. De server weet daardoor alleen "stuur deze tekst om 07:04";
 * hij weet niet waar je heen gaat, en hoeft je agenda dus ook niet te kunnen
 * lezen. Vervangen in plaats van toevoegen, zodat een verschoven les niet naast
 * de oude melding komt te staan.
 */

/** Langer vooruit heeft geen zin: je opent de app toch wel weer eens. */
const MAX_DAYS_AHEAD = 14;
const MAX_TEXT = 200;

interface Message {
  sendAt?: unknown;
  title?: unknown;
  body?: unknown;
}

function clean(message: Message, now: number): { send_at: string; title: string; body: string } | null {
  if (typeof message.sendAt !== "string") return null;
  const at = Date.parse(message.sendAt);
  if (!Number.isFinite(at)) return null;
  if (at <= now) return null;
  if (at > now + MAX_DAYS_AHEAD * 86_400_000) return null;
  if (typeof message.title !== "string" || typeof message.body !== "string") return null;

  const title = message.title.slice(0, MAX_TEXT);
  const body = message.body.slice(0, MAX_TEXT);
  if (!title) return null;

  return { send_at: new Date(at).toISOString(), title, body };
}

export async function PUT(request: Request) {
  const limit = checkRateLimit(`push-schedule:${clientKey(request)}`, {
    limit: 120,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: say(request, "api.tooMany", { seconds: limit.retryAfter }) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: say(request, "api.pushNotConfigured") }, { status: 501 });
  }

  let body: { device?: unknown; messages?: unknown };
  try {
    body = (await request.json()) as { device?: unknown; messages?: unknown };
  } catch {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  if (!isDeviceId(body.device) || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  const now = Date.now();
  const rows = (body.messages as Message[])
    .map((message) => clean(message, now))
    .filter((row): row is { send_at: string; title: string; body: string } => row !== null)
    .slice(0, MAX_QUEUE)
    .map((row) => ({ ...row, device_id: body.device as string }));

  // Alles wat nog niet verstuurd is vervangen; wat al weg is blijft staan voor
  // de opruimtaak.
  const { error: clearError } = await admin
    .from(QUEUE_TABLE)
    .delete()
    .eq("device_id", body.device)
    .is("sent_at", null);
  if (clearError) {
    return NextResponse.json({ error: say(request, "api.pushStoreFailed") }, { status: 502 });
  }

  if (rows.length > 0) {
    const { error } = await admin.from(QUEUE_TABLE).insert(rows);
    if (error) {
      return NextResponse.json({ error: say(request, "api.pushStoreFailed") }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true, queued: rows.length });
}
