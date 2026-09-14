import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { hashConnectorToken, readConnectorToken } from "@/lib/connectorToken";
import {
  handleMessage,
  isSupportedVersion,
  parseErrorResponse,
  ASSUMED_VERSION,
  type ToolDefinition,
  type ToolOutcome,
} from "@/lib/mcp";
import {
  deleteActivities,
  readAgenda,
  saveActivities,
  type AgendaData,
} from "@/lib/agendaTools";
import pkg from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mcp — de Claude-connector.
 *
 * Eén adres waarmee een gesprek met Claude bij deze agenda kan: lezen wat er
 * staat, blokken plannen, blokken weghalen. Wie er binnenkomt blijkt uit het
 * connector-token in de Authorization-header; dat token wijst naar precies één
 * gebruiker, en die gebruiker is het enige waar deze route bij kan.
 *
 * De data gaat door dezelfde rij als de synchronisatie (`user_data`), dus wat
 * hier binnenkomt staat in de app en andersom. Wel met een kanttekening die in
 * de documentatie hoort te staan: de app haalt die rij op bij het openen, dus
 * een planning die nu geschreven wordt zie je op je telefoon zodra je hem weer
 * opent.
 */

/** Alleen onze eigen pagina's mogen dit vanuit een browser aanroepen. */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Geen Origin: dan komt het verzoek niet uit een browser. Dat is het normale
  // geval — Claude praat hier vanaf een server, niet vanaf een tabblad.
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const TOOLS: ToolDefinition[] = [
  {
    name: "read_agenda",
    title: "Agenda lezen",
    description:
      "De agenda over een periode, met de herhalingen al uitgerekend tot losse " +
      "dagen, plus het open huiswerk en de komende toetsen. Per activiteit staat " +
      "erbij hoe laat je van huis moet (departure) en hoe lang de reis duurt. " +
      "Roep dit altijd aan vóór je iets inplant. Zonder periode: de komende " +
      "veertien dagen.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Eerste dag, JJJJ-MM-DD. Standaard vandaag." },
        to: { type: "string", description: "Laatste dag, JJJJ-MM-DD. Hooguit 62 dagen na `from`." },
      },
    },
  },
  {
    name: "save_activities",
    title: "Activiteiten bewaren",
    description:
      "Zet blokken in de agenda. Een blok zonder `id` komt erbij; een blok mét " +
      "een bestaand `id` vervangt dat blok — zo verplaats je iets. Gebruik " +
      "`source: \"leerplan\"` voor leer- en werkblokken, en `linkedTaskId` of " +
      "`linkedExamId` om ze aan huiswerk of een toets te koppelen: dan krijgen " +
      "ze een streep zodra dat werk af is.",
    inputSchema: {
      type: "object",
      properties: {
        activities: {
          type: "array",
          description: "Hooguit 100 tegelijk.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Alleen bij het wijzigen van een bestaand blok." },
              title: { type: "string" },
              date: { type: "string", description: "JJJJ-MM-DD" },
              startTime: { type: "string", description: "UU:MM" },
              endTime: { type: "string", description: "UU:MM" },
              category: {
                type: "string",
                description: "school, werk, gym, koken, hobby of een eigen type.",
              },
              allDay: { type: "boolean" },
              source: { type: "string" },
              linkedTaskId: { type: "string" },
              linkedExamId: { type: "string" },
            },
            required: ["title", "date"],
          },
        },
      },
      required: ["activities"],
    },
  },
  {
    name: "delete_activities",
    title: "Activiteiten weghalen",
    description:
      "Haalt blokken weg op hun `id`. Gebruik dit om een oude planning op te " +
      "ruimen voor je een nieuwe zet. Let op: een blok uit het schoolrooster of " +
      "een gekoppelde agenda komt bij de volgende verversing gewoon terug.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
      },
      required: ["ids"],
    },
  },
];

/** De rij van deze gebruiker, in de vorm die de gereedschappen verwachten. */
async function loadAgenda(admin: SupabaseClient, userId: string): Promise<AgendaData> {
  const { data, error } = await admin
    .from("user_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const raw = (data?.data ?? {}) as Record<string, unknown>;
  return {
    settings: (raw.settings as AgendaData["settings"]) ?? null,
    activities: Array.isArray(raw.activities) ? (raw.activities as AgendaData["activities"]) : [],
    tasks: Array.isArray(raw.tasks) ? (raw.tasks as AgendaData["tasks"]) : [],
    exams: Array.isArray(raw.exams) ? (raw.exams as AgendaData["exams"]) : [],
    deletions: Array.isArray(raw.deletions) ? (raw.deletions as AgendaData["deletions"]) : [],
  };
}

async function storeAgenda(
  admin: SupabaseClient,
  userId: string,
  data: AgendaData,
): Promise<void> {
  const { error } = await admin
    .from("user_data")
    .upsert(
      { user_id: userId, data: data as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(error.message);
}

/** Antwoord van een gereedschap: JSON, want daar rekent een model het best mee. */
function asText(value: unknown): ToolOutcome {
  return { text: JSON.stringify(value, null, 2) };
}

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Verkeerde herkomst." }, { status: 403 });
  }

  // Een versie die we niet spreken hoort een 400 te geven, niet een antwoord
  // waarvan de client denkt dat het klopt.
  const version = request.headers.get("mcp-protocol-version") ?? ASSUMED_VERSION;
  if (!isSupportedVersion(version)) {
    return NextResponse.json(
      { error: `Protocolversie ${version} wordt hier niet ondersteund.` },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "De connector is op deze server niet ingesteld." },
      { status: 501 },
    );
  }

  const token = readConnectorToken(request);
  if (!token) {
    // Het protocol wil een 401 met een verwijzing naar hoe je je wél meldt.
    return NextResponse.json(
      { error: "Geen connector-token meegestuurd." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="vertrektijd-agenda"' } },
    );
  }

  const tokenHash = hashConnectorToken(token);

  // Op de hash en niet op het ip: één token hoort bij één agenda, en dat is
  // precies wat we willen begrenzen. Ruim genoeg voor een gesprek dat een paar
  // keer heen en weer gaat, streng genoeg om niet als doorgeefluik te dienen.
  const limit = checkRateLimit(`mcp:${tokenHash}`, { limit: 240, windowMs: 60 * 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Te veel verzoeken; probeer het straks opnieuw." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: lookupError } = await admin
    .from("connector_tokens")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (lookupError) {
    console.error("[api/mcp] token", lookupError);
    return NextResponse.json({ error: "De agenda is nu niet bereikbaar." }, { status: 503 });
  }
  if (!row) {
    return NextResponse.json({ error: "Dit token is niet (meer) geldig." }, { status: 401 });
  }
  const userId = row.user_id as string;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(parseErrorResponse(), { status: 400 });
  }

  async function call(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    const data = await loadAgenda(admin, userId);

    if (name === "read_agenda") {
      return asText(readAgenda(data, { from: args.from, to: args.to }));
    }

    if (name === "save_activities") {
      const result = saveActivities(data, args.activities);
      if (result.added === 0 && result.updated === 0) {
        return {
          text: JSON.stringify({ added: 0, updated: 0, skipped: result.skipped }, null, 2),
          isError: true,
        };
      }
      await storeAgenda(admin, userId, result.data);
      return asText({ added: result.added, updated: result.updated, skipped: result.skipped });
    }

    if (name === "delete_activities") {
      const result = deleteActivities(data, args.ids);
      if (result.removed > 0) await storeAgenda(admin, userId, result.data);
      return asText({ removed: result.removed, unknown: result.unknown });
    }

    // `handleMessage` controleert de naam al; dit is de vangnetregel.
    return { text: `Onbekend gereedschap: ${name}`, isError: true };
  }

  const response = await handleMessage(body, { list: TOOLS, call }, pkg.version);

  // Bijhouden dát het token leeft, zodat je in de instellingen een token kunt
  // herkennen dat je niet meer gebruikt. Mislukt dit, dan is dat geen reden om
  // het antwoord tegen te houden.
  void admin
    .from("connector_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .then(undefined, (error: unknown) => console.error("[api/mcp] last_used_at", error));

  // Een notificatie krijgt geen antwoord, alleen een lege bevestiging.
  if (!response) return new Response(null, { status: 202 });

  return NextResponse.json(response);
}

/**
 * Het protocol staat toe dat een server geen stroom aanbiedt; 405 is het
 * afgesproken antwoord. Alles wat wij doen past in één antwoord op de POST.
 */
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
