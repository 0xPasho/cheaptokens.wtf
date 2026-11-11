import { cacheTag } from "next/cache";

import { buildModelsResponse } from "@/lib/catalog/public-api";

async function getPublicModels() {
  "use cache";
  cacheTag("catalog");
  return buildModelsResponse();
}

export async function GET(): Promise<Response> {
  return Response.json(await getPublicModels());
}
