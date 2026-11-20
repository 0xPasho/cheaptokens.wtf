import { getDb } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/uuid";
import { readServerEnv } from "@/lib/env";
import { createAccountRotation } from "@/lib/gateway/accounts";
import { createCatalogSource, loadCatalogSnapshot } from "@/lib/gateway/catalog-snapshot";
import { createHoldBook } from "@/lib/gateway/holds";
import { createJsonLogger } from "@/lib/gateway/logger";
import type { GatewayDeps } from "@/lib/gateway/types";
import { createMemoryRateLimiter } from "@/lib/rate-limit/memory";

// Por instancia; Upstash sustituirá este limiter en el plan de deploy.
const rateLimiter = createMemoryRateLimiter();
// Por instancia, como el limiter: las reservas de los requests en curso de este proceso (ADR-0066).
const holds = createHoldBook();
// Por instancia: cada una rota entre las cuentas de cada upstream y recuerda cuáles fallaron (docs/07).
const accounts = createAccountRotation();
const log = createJsonLogger();
const catalog = createCatalogSource(() => loadCatalogSnapshot(getDb(), {
  env: process.env, environment: readServerEnv().appEnv, now: Date.now,
// Los costos cambian cada minuto (ADR-0055): el tope de precio no debe quedarse atrás.
}), { ttlMs: 15_000 });

export function getGatewayDeps(after: GatewayDeps["after"]): GatewayDeps {
  return { db: getDb(), rateLimiter, holds, catalog, accounts, fetch, after, now: Date.now, newId: uuidv7, log, env: readServerEnv() };
}
