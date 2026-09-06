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

  it("herkent een IPv4-adres dat als IPv6 is vermomd", () => {
    // De URL-lezer schrijft ::ffff:127.0.0.1 om naar ::ffff:7f00:1. Als tekst
    // ziet dat er onschuldig uit, maar het is gewoon het eigen apparaat.
    for (const host of [
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "[::ffff:7f00:1]",
      "::ffff:169.254.169.254",
      "::ffff:a9fe:a9fe",
      "::127.0.0.1",
    ]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it("herkent de overige IPv6-adressen binnen een netwerk", () => {
    for (const host of ["::", "::1", "fe80::1", "fc00::1", "fd12:3456::1"]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it("weigert multicast en gereserveerde adressen", () => {
    for (const host of ["224.0.0.1", "239.255.255.250", "255.255.255.255"]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it("houdt gewone namen die met fc of fd beginnen gewoon toe", () => {
    // Deze vielen af omdat de IPv6-controle op de kale tekst keek.
    for (const host of ["fd.nl", "fcbarcelona.com", "fdm.dk", "fe80.example.com"]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });

  it("laat een gewoon IPv6-adres door", () => {
    for (const host of ["2001:4860:4860::8888", "2a00:1450:400e:80f::200e"]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });

  it("laat gewone adressen door", () => {
    for (const host of ["magister.net", "8.8.8.8", "172.32.0.1", "11.0.0.1", "example.com"]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});

describe("checkPublicUrl bij vermomde adressen", () => {
  it("weigert de getallen-schrijfwijze van localhost", () => {
    // De URL-lezer maakt hier zelf 127.0.0.1 van; dit legt vast dat we daarop
    // mogen leunen.
    for (const raw of ["http://2130706433/", "http://0x7f000001/", "http://127.1/"]) {
      expect(checkPublicUrl(raw).ok, raw).toBe(false);
    }
  });

  it("weigert een IPv4-adres dat als IPv6 is geschreven", () => {
    expect(checkPublicUrl("http://[::ffff:127.0.0.1]/agenda.ics").ok).toBe(false);
    expect(checkPublicUrl("http://[::ffff:a9fe:a9fe]/latest/meta-data/").ok).toBe(false);
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
