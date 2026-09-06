import { NextResponse } from "next/server";
import webpush from "web-push";
import { DEVICES_TABLE, QUEUE_TABLE, adminClient } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/send — stuurt alles wat nu aan de beurt is.
 *
 * Wordt elke minuut aangeroepen door een klok in Supabase (pg_cron), niet door
 * een browser. Daarom is hij afgeschermd met een eigen geheim: zonder dat komt
 * er niets doorheen, en zonder afscherming zou iedereen de wachtrij kunnen
 * laten leeglopen op een verkeerd moment.
 *
 * Deze route geeft bewust geen inhoud terug over wie wat krijgt; alleen hoeveel
 * berichten er weg zijn.
 */

/** Hoeveel berichten we per ronde versturen; een minuut is zo voorbij. */
const BATCH = 100;

/** Zo lang na het geplande moment mag een melding nog komen. */
const GRACE_MS = 15 * 60_000;

interface QueueRow {
  id: string;
  device_id: string;
  send_at: string;
  title: string;
  body: string;
}

interface DeviceRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_CRON_SECRET?.trim();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const contact = process.env.VAPID_CONTACT?.trim() || "mailto:noreply@example.com";
  const admin = adminClient();
  if (!publicKey || !privateKey || !admin) {
    return NextResponse.json({ error: "not configured" }, { status: 501 });
  }

  webpush.setVapidDetails(contact, publicKey, privateKey);

  const now = Date.now();
  const { data: due, error } = await admin
    .from(QUEUE_TABLE)
    .select("id, device_id, send_at, title, body")
    .is("sent_at", null)
    .lte("send_at", new Date(now).toISOString())
    .gte("send_at", new Date(now - GRACE_MS).toISOString())
    .order("send_at")
    .limit(BATCH);

  if (error) return NextResponse.json({ error: "query failed" }, { status: 502 });

  const rows = (due ?? []) as QueueRow[];
  if (rows.length === 0) return NextResponse.json({ sent: 0 });

  const deviceIds = [...new Set(rows.map((row) => row.device_id))];
  const { data: deviceRows } = await admin
    .from(DEVICES_TABLE)
    .select("id, endpoint, p256dh, auth")
    .in("id", deviceIds);

  const devices = new Map(((deviceRows ?? []) as DeviceRow[]).map((row) => [row.id, row]));

  const done: string[] = [];
  const gone = new Set<string>();

  for (const row of rows) {
    const device = devices.get(row.device_id);
    if (!device) {
      // Apparaat bestaat niet meer; het bericht kan weg.
      done.push(row.id);
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
        JSON.stringify({ title: row.title, body: row.body }),
        { TTL: 15 * 60 },
      );
      done.push(row.id);
    } catch (sendError) {
      const status = (sendError as { statusCode?: number }).statusCode;
      // 404/410: de browser heeft zich afgemeld. Dan het apparaat opruimen in
      // plaats van het elke minuut opnieuw proberen.
      if (status === 404 || status === 410) {
        gone.add(row.device_id);
        done.push(row.id);
      }
    }
  }

  if (done.length > 0) {
    await admin.from(QUEUE_TABLE).update({ sent_at: new Date().toISOString() }).in("id", done);
  }
  if (gone.size > 0) {
    await admin.from(QUEUE_TABLE).delete().in("device_id", [...gone]);
    await admin.from(DEVICES_TABLE).delete().in("id", [...gone]);
  }

  return NextResponse.json({ sent: done.length });
}
