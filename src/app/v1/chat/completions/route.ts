import { after } from "next/server";

import { handleChatCompletion } from "@/lib/gateway/handler";
import { getGatewayDeps } from "@/lib/server/gateway-deps";

export const maxDuration = 800;

export async function POST(request: Request): Promise<Response> {
  return handleChatCompletion(request, getGatewayDeps(after));
}
