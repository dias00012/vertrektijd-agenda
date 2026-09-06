import type { Metadata } from "next";
import { PrivacyStatement } from "@/components/PrivacyStatement";

export const metadata: Metadata = {
  title: "Privacy | Vertrektijd",
  description: "Wat Vertrektijd van je bewaart, waarom, en hoe je het weer weghaalt.",
};

/**
 * De pagina blijft server-side vanwege de titel; de tekst staat in een
 * client-component omdat die de gekozen taal moet volgen.
 */
export default function PrivacyPage() {
  return <PrivacyStatement />;
}
