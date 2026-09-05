import { describe, expect, it } from "vitest";
import { checkPublicUrl, isPrivateHost } from "./safeUrl";

describe("isPrivateHost", () => {
  it("herkent het eigen apparaat", () => {
    for (const host of ["localhost", "app.localhost", "127.0.0.1", "0.0.0.0", "::1"]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it("herkent adressen binnen een netwerk", () => {
    for (const host of ["10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255", "100.64.0.1"]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it("herkent het metadata-adres van cloudproviders", () => {
    expect(isPrivateHost("169.254.169.254")).toBe(true);
  });

  it("laat gewone adressen door", () => {
    for (const host of ["magister.net", "8.8.8.8", "172.32.0.1", "11.0.0.1", "example.com"]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});

describe("checkPublicUrl", () => {
  it("accepteert een gewone https-link", () => {
    const result = checkPublicUrl("https://school.magister.net/agenda.ics");
    expect(result.ok).toBe(true);
  });

  it("vertaalt webcal naar https", () => {
    const result = checkPublicUrl("webcal://school.example.com/rooster.ics");
    expect(result.ok && result.url.protocol).toBe("https:");
  });

  it("weigert een bestand op de server zelf", () => {
    expect(checkPublicUrl("file:///etc/passwd").ok).toBe(false);
  });

  it("weigert een intern adres", () => {
    expect(checkPublicUrl("http://192.168.0.10/rooster.ics").ok).toBe(false);
    expect(checkPublicUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
  });

  it("weigert onzin", () => {
    expect(checkPublicUrl("geen url").ok).toBe(false);
    expect(checkPublicUrl("").ok).toBe(false);
  });
});
