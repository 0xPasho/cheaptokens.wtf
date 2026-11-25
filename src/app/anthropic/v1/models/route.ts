import { cacheLife, cacheTag } from "next/cache";

import { loadCatalogEntries } from "@/lib/catalog/live";
import { buildAnthropicModelsResponse } from "@/lib/catalog/public-api";

async function getAnthropicModels() {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  return buildAnthropicModelsResponse(await loadCatalogEntries());
}

/** `GET /anthropic/v1/models`: el catálogo con la forma de Anthropic (ADR-0078). Público, como `/v1/models`. */
export async function GET(): Promise<Response> {
  return Response.json(await getAnthropicModels());
}
