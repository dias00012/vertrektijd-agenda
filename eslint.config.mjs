import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * ESLint-instellingen. Bewust de aanbevolen set van Next.js plus TypeScript:
 * die vangt de fouten die de compiler niet ziet, zoals ontbrekende
 * afhankelijkheden in een useEffect of een <img> waar <Image> hoort.
 */
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      ".next-verify/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/sw.js",
    ],
  },
];

export default config;
