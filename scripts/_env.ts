import { existsSync } from "node:fs";

/**
 * Los scripts corren fuera de Next, así que cargan `.env.local` a mano.
 * Importar este módulo primero en cada script de `scripts/`.
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
