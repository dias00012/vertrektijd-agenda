import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // De app rekent met lokale tijd en wordt in Nederland gebruikt. In UTC
    // getest zou de nacht van de tijdswissel nooit langskomen, terwijl juist
    // daar de vertrektijden misgaan.
    env: { TZ: "Europe/Amsterdam" },
  },
});
