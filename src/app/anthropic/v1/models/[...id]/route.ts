import { cacheLife, cacheTag } from "next/cache";

import { loadCatalogEntries } from "@/lib/catalog/live";
import { findAnthropicModel } from "@/lib/catalog/public-api";
import { anthropicErrorResponse, modelCandidates } from "@/lib/gateway/anthropic";

async function getAnthropicModel(name: string) {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  return findAnthropicModel(modelCandidates(name), await loadCatalogEntries());
}

/** `GET /anthropic/v1/models/{id}`: los IDs llevan `/` (`anthropic/claude-sonnet-5.5`), por eso el segmento comodín. */
export async function GET(_request: Request, ctx: RouteContext<"/anthropic/v1/models/[...id]">): Promise<Response> {
  const { id } = await ctx.params;
  // Next ya decodifica cada segmento: decodificar otra vez rompería con un `%` literal.
  const model = await getAnthropicModel(id.join("/"));
  return model ? Response.json(model) : anthropicErrorResponse("model_not_found");
}
