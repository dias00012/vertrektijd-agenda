/**
 * De protocol-kant van de connector: JSON-RPC volgens het Model Context
 * Protocol, over één HTTP-adres.
 *
 * Bewust zonder bibliotheek en zonder sessies. De server draait bij Vercel als
 * losse functie-aanroep: er is geen proces dat tussen twee verzoeken blijft
 * staan, dus valt er ook geen sessie vast te houden. Het protocol staat dat
 * expliciet toe — antwoord op een POST met gewoon `application/json`, geef geen
 * `Mcp-Session-Id` af, en beantwoord een GET met 405. Wat overblijft is klein
 * genoeg om te lezen en te testen.
 *
 * Spec: modelcontextprotocol.io, revisies 2025-03-26 t/m 2025-11-25.
 */

/** Wat we spreken, nieuwste eerst. */
export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

/** Wat we teruggeven als de client niets bruikbaars vraagt. */
export const LATEST_VERSION = SUPPORTED_VERSIONS[0];

/**
 * Zonder `MCP-Protocol-Version`-header hoort de server 2025-03-26 aan te nemen;
 * die revisie kende de header nog niet.
 */
export const ASSUMED_VERSION = "2025-03-26";

export const SERVER_NAME = "vertrektijd-agenda";

/** JSON-RPC-foutcodes die we gebruiken. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export interface JsonRpcError {
  code: number;
  message: string;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** Eén stuk gereedschap zoals `tools/list` het beschrijft. */
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Wat een aanroep oplevert. `isError` is een fout ín het gereedschap, geen protocolfout. */
export interface ToolOutcome {
  text: string;
  isError?: boolean;
}

export function isSupportedVersion(value: string): boolean {
  return (SUPPORTED_VERSIONS as readonly string[]).includes(value);
}

/**
 * De versie die we met deze client gaan spreken: die van de client wanneer we
 * hem kennen, anders de nieuwste die wij kennen. Het protocol schrijft voor dat
 * de client dan zelf beslist of hij daarmee verder kan.
 */
export function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && isSupportedVersion(requested)
    ? requested
    : LATEST_VERSION;
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Een los bericht van de client. */
interface RpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Eén bericht afhandelen.
 *
 * Geeft `null` terug bij een notificatie (een bericht zonder `id`): daar hoort
 * geen antwoord bij, alleen een lege 202 van de HTTP-laag.
 */
export async function handleMessage(
  message: unknown,
  tools: {
    list: ToolDefinition[];
    call: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;
  },
  serverVersion: string,
): Promise<JsonRpcResponse | null> {
  if (!isRecord(message)) return fail(null, INVALID_REQUEST, "Geen JSON-RPC-bericht.");

  const { id, method, params } = message as RpcMessage;
  const rpcId = typeof id === "string" || typeof id === "number" ? id : null;
  // Een notificatie herken je aan het ontbreken van `id`, niet aan de methode:
  // zo hoeven we geen lijst bij te houden van welke berichten dat zijn.
  const isNotification = id === undefined;

  if (typeof method !== "string") {
    return isNotification ? null : fail(rpcId, INVALID_REQUEST, "Geen methode opgegeven.");
  }

  // Notificaties: aannemen en verder niets. `notifications/initialized` is de
  // enige die we in de praktijk zien; de rest negeren we net zo goed.
  if (isNotification) return null;

  switch (method) {
    case "initialize": {
      const requested = isRecord(params) ? params.protocolVersion : undefined;
      return ok(rpcId, {
        protocolVersion: negotiateVersion(requested),
        capabilities: { tools: {} },
        serverInfo: {
          name: SERVER_NAME,
          title: "Vertrektijd-agenda",
          version: serverVersion,
        },
        instructions:
          "De agenda van één persoon: activiteiten, huiswerk en toetsen, met " +
          "reistijden van huis. Lees eerst met read_agenda voordat je iets " +
          "inplant, zodat je de bestaande dag ziet inclusief vertrektijden. " +
          "Plan werk- en leerblokken met save_activities; een blok verplaatsen " +
          "doe je door hetzelfde id met een andere tijd terug te sturen.",
      });
    }

    case "ping":
      // Hoort bij het protocol en kost niets: een leeg resultaat is het antwoord.
      return ok(rpcId, {});

    case "tools/list":
      return ok(rpcId, { tools: tools.list });

    case "tools/call": {
      if (!isRecord(params) || typeof params.name !== "string") {
        return fail(rpcId, INVALID_PARAMS, "Geen naam van een gereedschap opgegeven.");
      }
      if (!tools.list.some((tool) => tool.name === params.name)) {
        return fail(rpcId, INVALID_PARAMS, `Onbekend gereedschap: ${params.name}`);
      }
      const args = isRecord(params.arguments) ? params.arguments : {};
      try {
        const outcome = await tools.call(params.name, args);
        return ok(rpcId, {
          content: [{ type: "text", text: outcome.text }],
          isError: outcome.isError === true,
        });
      } catch (error) {
        // Een kapotte databaseverbinding is geen fout van het model: die hoort
        // als protocolfout terug, niet als iets waar het model omheen probeert
        // te redeneren.
        console.error("[api/mcp] tool", params.name, error);
        return fail(rpcId, INTERNAL_ERROR, "De agenda is nu niet bereikbaar.");
      }
    }

    default:
      return fail(rpcId, METHOD_NOT_FOUND, `Onbekende methode: ${method}`);
  }
}

/** Een los antwoord voor een body die geen geldige JSON was. */
export function parseErrorResponse(): JsonRpcResponse {
  return fail(null, PARSE_ERROR, "Onleesbare JSON.");
}
