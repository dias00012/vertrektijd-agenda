import { NextResponse } from "next/server";
import { say } from "@/lib/server/language";
import { checkRateLimit, clientKey } from "@/lib/server/rateLimit";
import { DEVICES_TABLE, QUEUE_TABLE, adminClient, isDeviceId } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe — dit apparaat wil meldingen ontvangen.
 * DELETE /api/push/subscribe — dit apparaat wil dat niet meer.
 *
 * We bewaren alleen wat nodig is om een melding af te leveren: het adres dat
 * de browser zelf uitgeeft en de twee sleutels waarmee het bericht versleuteld
 * wordt. Geen naam, geen account, geen agenda.
 */

interface Body {
  device?: unknown;
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
}

export async function POST(request: Request) {
  const limit = checkRateLimit(`push-subscribe:${clientKey(request)}`, {
    limit: 20,
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;

  if (
    !isDeviceId(body.device) ||
    typeof endpoint !== "string" ||
    !/^https:\/\//.test(endpoint) ||
    endpoint.length > 1000 ||
    typeof p256dh !== "string" ||
    typeof auth !== "string"
  ) {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  const { error } = await admin
    .from(DEVICES_TABLE)
    .upsert({ id: body.device, endpoint, p256dh, auth }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: say(request, "api.pushStoreFailed") }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: say(request, "api.pushNotConfigured") }, { status: 501 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }
  if (!isDeviceId(body.device)) {
    return NextResponse.json({ error: say(request, "api.badRequest") }, { status: 400 });
  }

  // De wachtrij eerst: anders blijven er berichten staan voor een adres dat er
  // niet meer is.
  await admin.from(QUEUE_TABLE).delete().eq("device_id", body.device);
  await admin.from(DEVICES_TABLE).delete().eq("id", body.device);
  return NextResponse.json({ ok: true });
}
