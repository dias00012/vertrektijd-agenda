/**
 * De vingerafdrukken die in `/.well-known/assetlinks.json` terechtkomen.
 *
 * Apart van de route zodat het na te rekenen is zonder een server te starten.
 * Wat hier fout gaat merk je namelijk pas ná het uploaden naar Play Console:
 * een vingerafdruk die niet klopt betekent dat de app mét browserbalk opent en
 * eruitziet als een website in plaats van als een app.
 */

/** Play Console toont hem als 32 paren hex met dubbele punten ertussen. */
const VINGERAFDRUK = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function fingerprints(raw: string | undefined): string[] {
  return (
    (raw ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      // Onzin eruit: een verzonnen vingerafdruk uitserveren is erger dan geen,
      // want dan lijkt het goed te staan terwijl Android hem afwijst.
      .filter((value) => VINGERAFDRUK.test(value))
  );
}

export interface AssetLink {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

export function assetLinks(packageName: string, raw: string | undefined): AssetLink[] {
  const afdrukken = fingerprints(raw);
  if (afdrukken.length === 0) return [];

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: afdrukken,
      },
    },
  ];
}
