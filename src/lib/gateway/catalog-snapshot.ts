import { and, asc, eq, isNull, ne } from "drizzle-orm";

import type { UpstreamEnvironment } from "@/lib/catalog/types";
import { modelUpstreams, models, upstreams } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { readSecret, upstreamBaseUrlOverride, type EnvSource } from "@/lib/env";

import type { CatalogSnapshot, CatalogSource, GatewayModel } from "./types";

export async function loadCatalogSnapshot(
  db: Db,
  { now, env, environment }: { now: () => number; env: EnvSource; environment: UpstreamEnvironment },
): Promise<CatalogSnapshot> {
  const loadedAt = now();
  const modelRows = await db.select().from(models);
  const mappingRows = await db.select({ mapping: modelUpstreams, upstream: upstreams })
    .from(modelUpstreams)
    .innerJoin(upstreams, eq(modelUpstreams.upstreamId, upstreams.id))
    .where(and(
      eq(modelUpstreams.enabled, true),
      isNull(modelUpstreams.opsDisabledAt),
      eq(upstreams.enabled, true),
      environment === "production" ? ne(upstreams.id, "mock") : undefined,
    ))
    .orderBy(asc(modelUpstreams.priority), asc(upstreams.id));

  const byId = new Map<string, GatewayModel>(modelRows.map((model) => [model.id, {
    id: model.id,
    status: model.status,
    isReasoning: model.tags.includes("reasoning"),
    inputPricePer1M: model.inputPriceMicroUsd,
    outputPricePer1M: model.outputPriceMicroUsd,
    officialInputPer1M: model.officialInputPriceMicroUsd,
    officialOutputPer1M: model.officialOutputPriceMicroUsd,
    upstreams: [],
  }]));

  for (const { mapping, upstream } of mappingRows) {
    const apiKey = upstream.apiKeyEnv === null ? "" : readSecret(upstream.apiKeyEnv, env);
    if (apiKey === null) continue;
    const model = byId.get(mapping.modelId);
    if (!model) continue;
    byId.set(model.id, {
      ...model,
      upstreams: [...model.upstreams, {
        upstreamId: upstream.id,
        baseUrl: (upstreamBaseUrlOverride(upstream.id, env) ?? upstream.baseUrl).replace(/\/+$/, ""),
        apiKey,
        upstreamModel: mapping.upstreamModel,
        costInputPer1M: mapping.costInputMicroUsd,
        costOutputPer1M: mapping.costOutputMicroUsd,
        priority: mapping.priority,
        sendsPriceCap: upstream.sendsPriceCap,
      }],
    });
  }

  return { loadedAt, getModel: (id) => byId.get(id) };
}

export function createCatalogSource(
  load: () => Promise<CatalogSnapshot>,
  { ttlMs = 60_000, now = Date.now }: { ttlMs?: number; now?: () => number } = {},
): CatalogSource {
  let snapshot: CatalogSnapshot | undefined;
  let expiresAt = 0;
  let inFlight: Promise<CatalogSnapshot> | undefined;

  return () => {
    if (inFlight) return inFlight;
    const startedAt = now();
    if (snapshot && startedAt < expiresAt) return Promise.resolve(snapshot);

    inFlight = Promise.resolve().then(load).then((loaded) => {
      snapshot = loaded;
      // Contar desde el inicio evita prolongar el TTL por la latencia de la base.
      expiresAt = startedAt + ttlMs;
      return loaded;
    }).catch((error: unknown) => {
      if (snapshot) return snapshot;
      throw error;
    }).finally(() => {
      // Un fallo no renueva el TTL: la próxima llamada vuelve a intentar.
      inFlight = undefined;
    });
    return inFlight;
  };
}
