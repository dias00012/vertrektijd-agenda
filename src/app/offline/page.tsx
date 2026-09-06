import type { Metadata } from "next";
import { OfflineNotice } from "@/components/OfflineNotice";

export const metadata: Metadata = {
  title: "Geen verbinding | Vertrektijd",
};

/**
 * De pagina zelf blijft server-side vanwege de titel; de tekst staat in een
 * client-component omdat die de gekozen taal moet kunnen volgen.
 */
export default function OfflinePage() {
  return <OfflineNotice />;
}
