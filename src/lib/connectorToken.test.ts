import { describe, expect, it } from "vitest";
import {
  createConnectorToken,
  hashConnectorToken,
  readConnectorToken,
} from "./connectorToken";

describe("createConnectorToken", () => {
  it("begint met een herkenbaar voorvoegsel", () => {
    expect(createConnectorToken().startsWith("vta_")).toBe(true);
  });

  it("geeft elke keer iets anders", () => {
    const seen = new Set(Array.from({ length: 50 }, () => createConnectorToken()));
    expect(seen.size).toBe(50);
  });

  it("gebruikt tekens die veilig in een header passen", () => {
    // base64url: geen +, / of = die onderweg omgezet worden.
    expect(createConnectorToken()).toMatch(/^vta_[A-Za-z0-9_-]+$/);
  });
});

describe("hashConnectorToken", () => {
  it("geeft dezelfde hash voor hetzelfde token", () => {
    const token = createConnectorToken();
    expect(hashConnectorToken(token)).toBe(hashConnectorToken(token));
  });

  it("bevat het token zelf niet", () => {
    const token = createConnectorToken();
    expect(hashConnectorToken(token)).not.toContain(token.slice(4));
  });

  it("is een sha256 in hex", () => {
    expect(hashConnectorToken("vta_test")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("readConnectorToken", () => {
  const ask = (headers: Record<string, string>) =>
    readConnectorToken(new Request("https://example.com/api/mcp", { headers }));

  it("leest een bearer-token", () => {
    expect(ask({ authorization: "Bearer vta_abc" })).toBe("vta_abc");
  });

  it("accepteert de hoofdletters zoals ze komen", () => {
    expect(ask({ authorization: "bearer vta_abc" })).toBe("vta_abc");
  });

  it("negeert een token dat niet van ons is", () => {
    // Een Supabase-sessie is ook een bearer-token, maar hoort hier niet.
    expect(ask({ authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" })).toBeNull();
  });

  it("geeft null zonder header of bij een andere opzet", () => {
    expect(ask({})).toBeNull();
    expect(ask({ authorization: "Basic vta_abc" })).toBeNull();
    expect(ask({ authorization: "Bearer" })).toBeNull();
  });
});
