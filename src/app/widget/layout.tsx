import type { Metadata } from "next";

/**
 * Het vertrekscherm krijgt een eigen titel, want dit scherm komt als eigen
 * icoon op je beginscherm te staan. Daar is "Vertrektijd, slimme agenda" te
 * lang: een telefoon kapt dat af tot "Vertrektij…".
 */
export const metadata: Metadata = {
  title: "Vertrektijd",
  description: "Hoe laat je weg moet, in één oogopslag.",
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
