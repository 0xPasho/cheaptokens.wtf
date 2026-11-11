import { getDb } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/uuid";
import { readServerEnv } from "@/lib/env";
import { createCatalogSource, loadCatalogSnapshot } from "@/lib/gateway/catalog-snapshot";
import { createJsonLogger } from "@/lib/gateway/logger";
import type { GatewayDeps } from "@/lib/gateway/types";
import { createMemoryRateLimiter } from "@/lib/rate-limit/memory";

// Por instancia; Upstash sustituirá este limiter en el plan de deploy.
const rateLimiter = createMemoryRateLimiter();
const log = createJsonLogger();
const catalog = createCatalogSource(() => loadCatalogSnapshot(getDb(), {
  env: process.env, environment: readServerEnv().appEnv, now: Date.now,
}));

export function getGatewayDeps(after: GatewayDeps["after"]): GatewayDeps {
  return { db: getDb(), rateLimiter, catalog, fetch, after, now: Date.now, newId: uuidv7, log, env: readServerEnv() };
}
