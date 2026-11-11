import { modelUpstreams, models, upstreams } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

import { applyDiscount } from "./pricing";
import { toModel } from "./queries";
import { validateCatalog, type CatalogValidationInput } from "./validate";

export async function syncCatalog(db: Db, input: CatalogValidationInput): Promise<{ warnings: string[] }> {
  const { errors, warnings } = validateCatalog(input);
  if (errors.length > 0) throw new Error(`Invalid catalog:\n${errors.join("\n")}`);

  await db.transaction(async (tx) => {
    const existingModels = await tx.select({ id: models.id }).from(models);
    const ids = new Set(input.models.map((model) => model.id));
    const missing = existingModels.filter(({ id }) => !ids.has(id));
    if (missing.length > 0) {
      throw new Error(`Models missing from catalog: ${missing.map(({ id }) => id).join(", ")}. Mark them as retired instead.`);
    }

    for (const entry of input.models) {
      const values = {
        id: entry.id,
        name: entry.name,
        author: entry.author,
        description: entry.description,
        contextLength: entry.contextLength,
        officialInputPriceMicroUsd: BigInt(entry.officialInput),
        officialOutputPriceMicroUsd: BigInt(entry.officialOutput),
        officialPriceSourceUrl: entry.officialPriceSourceUrl,
        officialPriceVerifiedAt: entry.officialPriceVerifiedAt,
        discountBps: entry.discountBps,
        inputPriceMicroUsd: BigInt(applyDiscount(entry.officialInput, entry.discountBps)),
        outputPriceMicroUsd: BigInt(applyDiscount(entry.officialOutput, entry.discountBps)),
        tags: toModel(entry).allTags,
        status: entry.status,
        retiresAt: entry.retiresOn ?? null,
      };
      await tx.insert(models).values(values).onConflictDoUpdate({ target: models.id, set: values });
    }

    // Deshabilitar primero conserva el historial de lo que ya no está en el archivo o entorno.
    await tx.update(modelUpstreams).set({ enabled: false });
    await tx.update(upstreams).set({ enabled: false });

    for (const upstream of input.upstreams) {
      if (!upstream.environments.includes(input.environment)) continue;
      const values = {
        id: upstream.id,
        name: upstream.name,
        baseUrl: upstream.baseUrl,
        apiKeyEnv: upstream.apiKeyEnv,
        sendsPriceCap: upstream.sendsPriceCap,
        enabled: true,
      };
      await tx.insert(upstreams).values(values).onConflictDoUpdate({
        target: upstreams.id,
        set: { ...values, updatedAt: new Date() },
      });

      for (const mapping of upstream.models) {
        const mappingValues = {
          modelId: mapping.model,
          upstreamId: upstream.id,
          upstreamModel: mapping.upstreamModel,
          costInputMicroUsd: BigInt(mapping.costInputPer1M),
          costOutputMicroUsd: BigInt(mapping.costOutputPer1M),
          priority: mapping.priority,
          enabled: mapping.enabled ?? true,
        };
        // Los campos operativos quedan fuera del upsert para no revertir una emergencia.
        await tx.insert(modelUpstreams).values(mappingValues).onConflictDoUpdate({
          target: [modelUpstreams.modelId, modelUpstreams.upstreamId],
          set: mappingValues,
        });
      }
    }
  });

  return { warnings };
}
