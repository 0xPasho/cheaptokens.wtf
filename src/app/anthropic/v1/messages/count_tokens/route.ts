import { after } from "next/server";

import { handleAnthropicCountTokens } from "@/lib/gateway/anthropic-handler";
import { getGatewayDeps } from "@/lib/server/gateway-deps";

export async function POST(request: Request): Promise<Response> {
  return handleAnthropicCountTokens(request, getGatewayDeps(after));
}
