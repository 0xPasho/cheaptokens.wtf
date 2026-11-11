import { getCatalog } from "./queries";
import type { CatalogEntry } from "./types";

// El catálogo del repo no tiene fecha de alta; esta época permanece estable entre builds.
const MODEL_CREATED = 1_760_000_000;

export function priceInUsd(microUsd: bigint): string {
  const digits = microUsd.toString().padStart(7, "0");
  const fraction = digits.slice(-6).replace(/0+$/, "").padEnd(2, "0");
  return `${digits.slice(0, -6)}.${fraction}`;
}

export function buildModelsResponse(entries?: CatalogEntry[]) {
  return {
    object: "list",
    data: getCatalog(entries).map((model) => ({
      id: model.id, object: "model", created: MODEL_CREATED, owned_by: model.author,
      name: model.name, context_length: model.contextLength, tags: model.allTags,
      pricing: {
        currency: "USD", unit: "1M_tokens",
        input: priceInUsd(BigInt(model.discountedInput)), output: priceInUsd(BigInt(model.discountedOutput)),
        official_input: priceInUsd(BigInt(model.officialInput)), official_output: priceInUsd(BigInt(model.officialOutput)),
        discount_percent: model.discountBps / 100,
      },
      status: model.status,
    })),
  };
}
