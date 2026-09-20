import { describe, expect, it, vi } from "vitest";
import {
  handleMessage,
  isSupportedVersion,
  negotiateVersion,
  LATEST_VERSION,
  type ToolDefinition,
} from "./mcp";

const TOOLS: ToolDefinition[] = [
  {
    name: "read_agenda",
    title: "Agenda lezen",
    description: "Leest de agenda.",
    inputSchema: { type: "object", properties: {} },
  },
];

const call = vi.fn(async () => ({ text: "{}" }));

function tools() {
  return { list: TOOLS, call };
}

describe("negotiateVersion", () => {
  it("houdt de versie van de client aan als we die spreken", () => {
    expect(negotiateVersion("2025-06-18")).toBe("2025-06-18");
    expect(negotiateVersion("2025-03-26")).toBe("2025-03-26");
  });

  it("valt terug op onze nieuwste bij iets onbekends", () => {
    expect(negotiateVersion("1999-01-01")).toBe(LATEST_VERSION);
    expect(negotiateVersion(undefined)).toBe(LATEST_VERSION);
    expect(negotiateVersion(42)).toBe(LATEST_VERSION);
  });

  it("kent de drie revisies die we ondersteunen", () => {
    expect(isSupportedVersion("2025-11-25")).toBe(true);
    expect(isSupportedVersion("2024-11-05")).toBe(false);
  });
});

describe("handleMessage", () => {
  it("beantwoordt initialize met versie, mogelijkheden en naam", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      tools(),
      "0.52.0",
    );
    const result = response?.result as Record<string, unknown>;
    expect(response?.id).toBe(1);
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toEqual({ tools: {} });
    expect((result.serverInfo as { version: string }).version).toBe("0.52.0");
  });

  it("geeft geen antwoord op een notificatie", async () => {
    // Zonder `id` hoort er niets terug te komen; de HTTP-laag stuurt dan 202.
    const response = await handleMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      tools(),
      "0.52.0",
    );
    expect(response).toBeNull();
  });

  it("noemt de gereedschappen bij tools/list", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      tools(),
      "0.52.0",
    );
    expect((response?.result as { tools: ToolDefinition[] }).tools).toHaveLength(1);
  });

  it("roept een gereedschap aan en verpakt het antwoord als tekst", async () => {
    const spy = vi.fn(async () => ({ text: "hallo" }));
    const response = await handleMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "read_agenda", arguments: { from: "2026-09-14" } },
      },
      { list: TOOLS, call: spy },
      "0.52.0",
    );
    expect(spy).toHaveBeenCalledWith("read_agenda", { from: "2026-09-14" });
    expect(response?.result).toEqual({
      content: [{ type: "text", text: "hallo" }],
      isError: false,
    });
  });

  it("geeft een protocolfout bij een onbekend gereedschap", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "bestaat_niet" } },
      tools(),
      "0.52.0",
    );
    expect(response?.error?.code).toBe(-32602);
  });

  it("geeft een protocolfout bij een onbekende methode", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 5, method: "resources/list" },
      tools(),
      "0.52.0",
    );
    expect(response?.error?.code).toBe(-32601);
  });

  it("vertaalt een kapot gereedschap naar een interne fout, niet naar een modelfout", async () => {
    // Een database die eruit ligt is niets waar het model omheen kan redeneren;
    // dat hoort geen `isError`-antwoord te worden waar het opnieuw op probeert.
    const broken = vi.fn(async () => {
      throw new Error("db weg");
    });
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "read_agenda" } },
      { list: TOOLS, call: broken },
      "0.52.0",
    );
    expect(response?.error?.code).toBe(-32603);
  });

  it("beantwoordt ping", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", id: 7, method: "ping" },
      tools(),
      "0.52.0",
    );
    expect(response?.result).toEqual({});
  });

  it("wijst iets af dat geen bericht is", async () => {
    const response = await handleMessage("kaas", tools(), "0.52.0");
    expect(response?.error?.code).toBe(-32600);
  });
});
