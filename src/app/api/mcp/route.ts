import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { BusyError, withAgenda, type AgendaStore } from "@/lib/server/agendaStore";
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
  moveOccurrence,
  readAgenda,
  saveActivities,
  skipOccurrence,
  updateSchoolwork,
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
      "dagen, plus het open huiswerk en de komende toetsen. Roep dit altijd aan " +
      "vóór je iets inplant. Zonder periode: de komende veertien dagen.\n\n" +
      "Per dag staat er `free`: de gaten waarin werkelijk iets past, met de " +
      "reistijden er al in verwerkt. Plan daarin, en reken de dag niet zelf na " +
      "uit de lijst activiteiten — dat is precies waar het misgaat. Levert " +
      "`free` te weinig op, kijk dan naar `movable`: blokken die zouden kunnen " +
      "wijken. Stel dat voor en wacht op antwoord; verzet ze nooit uit jezelf.\n\n" +
      "`rules` zegt binnen welke uren je mag voorstellen. Per activiteit staat " +
      "`departure` (hoe laat je van huis moet), `arrival` (hoe laat je er bent) " +
      "en `backHome` (hoe laat je weer thuis bent). Tussen `departure` en " +
      "`backHome` ben je van huis. Per opdracht staat `plannedMinutes` (wat er " +
      "al voor staat) en `remainingMinutes` (wat er nog bij moet) — plan niet " +
      "opnieuw wat er al staat.\n\n" +
      "`duplicates` noemt wat er dubbel lijkt te staan en `clashes` wat er die " +
      "dag botst (ook wanneer alleen de reistijd eroverheen valt). Meld die, maar " +
      "ruim ze niet zelf op: welke van de twee weg mag is aan de gebruiker.\n\n" +
      "Staat er iets in de weg, zeg dan wat er wél kan in plaats van alleen dat " +
      "het niet gaat. Bij `recurring: true` hoeft de hele reeks niet weg: " +
      "`skip_occurrence` zet één dag uit en `move_occurrence` verzet er één. " +
      "Stel het voor en wacht op antwoord.",
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
      "een bestaand `id` vervangt dat blok — zo verplaats je iets.\n\n" +
      "Lees eerst `read_agenda`, en plan niets in een tijd waarop je van huis " +
      "bent: een blok zonder `location` dat tussen `departure` en `backHome` van " +
      "een andere activiteit valt wordt geweigerd, met de reden erbij. Wil je een " +
      "bestaande planning vervangen, haal de oude blokken dan eerst weg met " +
      "`delete_activities` — anders staan ze er straks naast.\n\n" +
      "Gebruik `source: \"leerplan\"` voor leer- en werkblokken, en `linkedTaskId` " +
      "of `linkedExamId` om ze aan huiswerk of een toets te koppelen: dan krijgen " +
      "ze een streep zodra dat werk af is. Plan je een opdracht in losse blokken " +
      "per stap, zet dan ook `linkedStepId`: dat blok is dan af zodra die ene " +
      "stap is afgevinkt, niet pas als de hele opdracht af is.",
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
              linkedStepId: {
                type: "string",
                description: "De `id` van een stap uit `steps` van die taak.",
              },
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
  {
    name: "skip_occurrence",
    title: "Eén dag van een reeks overslaan",
    description:
      "Zet één dag van een herhalende activiteit uit, zonder de reeks zelf aan " +
      "te raken. Hiervoor is dit er: staat er elke maandag sporten en komt er " +
      "één keer iets anders tussen, dan hoef je niet te kiezen tussen die ene " +
      "maandag en alle maandagen.\n\n" +
      "Vraag dit altijd eerst. Een afspraak uit iemands agenda halen is een " +
      "besluit van de gebruiker, ook als het maar om één dag gaat — helemaal " +
      "wanneer er anderen bij betrokken zijn.\n\n" +
      "`restore: true` zet een eerder overgeslagen dag weer terug. Gebruik dat " +
      "als je je vergist hebt: via het scherm is een overgeslagen dag daarna " +
      "niet meer terug te halen.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "De `id` van de reeks, uit `read_agenda`." },
        date: { type: "string", description: "De dag die eruit moet, JJJJ-MM-DD." },
        restore: { type: "boolean", description: "Zet een overgeslagen dag terug." },
      },
      required: ["id", "date"],
    },
  },
  {
    name: "move_occurrence",
    title: "Eén dag van een reeks verzetten",
    description:
      "Verzet één dag van een herhalende activiteit naar een ander tijdstip of " +
      "een andere dag. Die dag valt uit de reeks en komt er los naast te staan; " +
      "de rest van de reeks blijft ongemoeid.\n\n" +
      "Ook dit altijd eerst vragen. En denk aan de reis: op een ander tijdstip " +
      "rijdt er een andere trein, dus de vertrektijd wordt opnieuw uitgerekend " +
      "en kan er anders uitzien dan je gewend bent.\n\n" +
      "Laat je `toDate` weg, dan blijft het dezelfde dag. Laat je `startTime` " +
      "en `endTime` weg, dan blijft het dezelfde tijd.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "De `id` van de reeks, uit `read_agenda`." },
        date: { type: "string", description: "De dag die verzet wordt, JJJJ-MM-DD." },
        toDate: { type: "string", description: "Naar welke dag, JJJJ-MM-DD. Standaard dezelfde." },
        startTime: { type: "string", description: "UU:MM. Standaard de tijd van de reeks." },
        endTime: { type: "string", description: "UU:MM. Standaard de tijd van de reeks." },
      },
      required: ["id", "date"],
    },
  },
  {
    name: "update_schoolwork",
    title: "Huiswerk bijwerken",
    description:
      "Vink stappen van een opdracht af, of zet de stand of de prioriteit van " +
      "een opdracht of toets. Gebruik dit zodra iemand zegt dat iets af is: dan " +
      "klopt de agenda weer, want gekoppelde leerblokken krijgen meteen een " +
      "streep en de resterende tijd wordt opnieuw geteld.\n\n" +
      "De prioriteit is er om verschil te maken. Staat alles op `high` — wat " +
      "gebeurt als een heel rooster in één keer is ingevoerd — dan zegt rood " +
      "niets meer. Wat deze week af moet is niet even dringend als iets van over " +
      "drie weken. Stel het voor en werk het bij wanneer iemand dat wil.\n\n" +
      "Vink je de laatste stap af, dan gaat de opdracht vanzelf op \"done\"; " +
      "haal je er daarna weer een weg, dan komt hij op \"doing\". Dat hoef je " +
      "dus niet apart mee te sturen.\n\n" +
      "Nieuw huiswerk aanmaken of weggooien kan hier bewust niet: dat doet de " +
      "gebruiker zelf in de app. Zeg het als er iets bij zou moeten.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "De `id` van een opdracht uit `read_agenda`." },
        examId: { type: "string", description: "De `id` van een toets. Alleen met `status`." },
        status: { type: "string", description: "todo, doing of done." },
        priority: {
          type: "string",
          description: "high (rood), medium (oranje), low (geel) of later (groen).",
        },
        steps: {
          type: "array",
          description: "De stappen die je aan- of uitvinkt.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "De `id` van de stap, uit `steps` van die taak." },
              done: { type: "boolean" },
            },
            required: ["id"],
          },
        },
      },
    },
  },
];

/**
 * De rij van deze gebruiker, met `updated_at` erbij als versie.
 *
 * Die versie is wat een gelijktijdige wijziging zichtbaar maakt: schrijven
 * gebeurt alleen wanneer de rij nog precies zo in de database staat. Zie
 * `src/lib/server/agendaStore.ts` voor waarom dat nodig bleek.
 */
function agendaStore(admin: SupabaseClient, userId: string): AgendaStore {
  return {
    async load() {
      const { data, error } = await admin
        .from("user_data")
        .select("data, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);

      const raw = (data?.data ?? {}) as Record<string, unknown>;
      return {
        version: (data?.updated_at as string | undefined) ?? null,
        data: {
          settings: (raw.settings as AgendaData["settings"]) ?? null,
          activities: Array.isArray(raw.activities)
            ? (raw.activities as AgendaData["activities"])
            : [],
          tasks: Array.isArray(raw.tasks) ? (raw.tasks as AgendaData["tasks"]) : [],
          exams: Array.isArray(raw.exams) ? (raw.exams as AgendaData["exams"]) : [],
          deletions: Array.isArray(raw.deletions) ? (raw.deletions as AgendaData["deletions"]) : [],
        },
      };
    },

    async save(data, version) {
      const row = {
        data: data as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      };

      // Nog geen rij: dan invoegen. Bestaat hij ondertussen toch (een tweede
      // verzoek was ons net voor), dan botst de sleutel en is dat het sein om
      // het over te doen -- niet een fout om de gebruiker mee lastig te vallen.
      if (version === null) {
        const { error } = await admin.from("user_data").insert({ user_id: userId, ...row });
        if (!error) return true;
        if (error.code === "23505") return false;
        throw new Error(error.message);
      }

      // `select()` geeft de gewijzigde rijen terug: nul betekent dat
      // `updated_at` niet meer klopte, en dus dat er iemand tussendoor schreef.
      const { data: changed, error } = await admin
        .from("user_data")
        .update(row)
        .eq("user_id", userId)
        .eq("updated_at", version)
        .select("user_id");
      if (error) throw new Error(error.message);
      return (changed?.length ?? 0) > 0;
    },
  };
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

  const store = agendaStore(admin, userId);

  async function call(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    try {
      // Elk gereedschap krijgt verse gegevens en geeft terug wat er veranderd
      // is. `withAgenda` schrijft dat alleen weg als niemand ons voor was, en
      // doet het anders over op de nieuwe rij.
      return await withAgenda<ToolOutcome>(store, (data) => {
        if (name === "read_agenda") {
          return { outcome: asText(readAgenda(data, { from: args.from, to: args.to })) };
        }

        if (name === "save_activities") {
          const result = saveActivities(data, args.activities);
          if (result.added === 0 && result.updated === 0) {
            return {
              outcome: {
                text: JSON.stringify({ added: 0, updated: 0, skipped: result.skipped }, null, 2),
                isError: true,
              },
            };
          }
          return {
            next: result.data,
            outcome: asText({
              added: result.added,
              updated: result.updated,
              skipped: result.skipped,
            }),
          };
        }

        if (name === "delete_activities") {
          const result = deleteActivities(data, args.ids);
          return {
            next: result.removed > 0 ? result.data : undefined,
            outcome: asText({ removed: result.removed, unknown: result.unknown }),
          };
        }

        if (name === "skip_occurrence" || name === "move_occurrence") {
          const result =
            name === "skip_occurrence" ? skipOccurrence(data, args) : moveOccurrence(data, args);
          if (!result.ok) {
            return {
              outcome: { text: JSON.stringify({ reason: result.reason }, null, 2), isError: true },
            };
          }
          // Een dag die al uit stond levert dezelfde gegevens op; dan valt er
          // ook niets te schrijven.
          return {
            next: result.data,
            outcome: asText({ ok: true, note: result.note, newId: result.newId }),
          };
        }

        if (name === "update_schoolwork") {
          const result = updateSchoolwork(data, args);
          if (!result.ok) {
            return {
              outcome: { text: JSON.stringify({ reason: result.reason }, null, 2), isError: true },
            };
          }
          return { next: result.data, outcome: asText({ ok: true, note: result.note }) };
        }

        // `handleMessage` controleert de naam al; dit is de vangnetregel.
        return { outcome: { text: `Onbekend gereedschap: ${name}`, isError: true } };
      });
    } catch (error) {
      // Liever eerlijk zeggen dat het niet gelukt is dan "gelukt" antwoorden
      // over een wijziging die door een ander verzoek is overschreven.
      if (error instanceof BusyError) {
        return {
          text: JSON.stringify(
            {
              reason:
                "de agenda werd ondertussen door iets anders gewijzigd; lees hem " +
                "opnieuw en probeer het nog een keer",
            },
            null,
            2,
          ),
          isError: true,
        };
      }
      throw error;
    }
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
