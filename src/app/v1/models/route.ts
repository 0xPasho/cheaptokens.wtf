import { cacheLife, cacheTag } from "next/cache";

import { loadCatalogEntries } from "@/lib/catalog/live";
import { buildModelsResponse } from "@/lib/catalog/public-api";

async function getPublicModels() {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  return buildModelsResponse(await loadCatalogEntries());
}

export async function GET(): Promise<Response> {
  return Response.json(await getPublicModels());
}
