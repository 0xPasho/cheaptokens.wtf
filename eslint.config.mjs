import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // El gateway no importa nada de la web ni de Next: todo le llega por inyección (ADR-0005, ADR-0033).
  {
    files: ["src/lib/gateway/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*"], message: "El gateway no importa Next: recibe after() y lo demás en GatewayDeps (ADR-0033)." },
            { group: ["react", "react/*", "react-dom", "react-dom/*"], message: "El gateway no importa React (ADR-0005)." },
            { group: ["@clerk/*"], message: "El gateway no toca Clerk (ADR-0003)." },
            { group: ["@/lib/i18n", "@/lib/i18n/*"], message: "Los errores del gateway van en inglés y no usan diccionarios (docs/04)." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
