import type { CatalogModel } from "@/lib/catalog/types";
import { chargeForTokens } from "@/lib/gateway/metering";

import { REFERENCE_MODEL_ID, TYPICAL_REQUEST } from "./plans";

type Priced = Pick<CatalogModel, "id" | "discountedInput" | "discountedOutput">;

/** Lo que vale una request típica (20 mil de entrada, 2 mil de salida) con el precio cheapllm.wtf del modelo. */
export function typicalCost(model: Priced): bigint {
  return chargeForTokens(TYPICAL_REQUEST, { input: BigInt(model.discountedInput), output: BigInt(model.discountedOutput) });
}

/** Cuánto gasta el modelo frente a Claude Sonnet 5.5 (1×). */
export function usageMultiplier(model: Priced, models: readonly Priced[]): number {
  const reference = models.find((candidate) => candidate.id === REFERENCE_MODEL_ID) ?? model;
  return Number(typicalCost(model)) / Number(typicalCost(reference));
}

/** Requests típicas del modelo que caben en un monto. */
export function typicalRequestsIn(amountMicroUsd: bigint, model: Priced): number {
  const cost = typicalCost(model);
  return cost > BigInt(0) ? Number(amountMicroUsd / cost) : 0;
}
