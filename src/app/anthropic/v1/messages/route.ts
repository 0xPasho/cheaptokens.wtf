import { after } from "next/server";

import { handleAnthropicMessages } from "@/lib/gateway/anthropic-handler";
import { getGatewayDeps } from "@/lib/server/gateway-deps";

// Un turno de agente puede generar durante minutos, igual que `/v1/chat/completions` (ADR-0078).
export const maxDuration = 800;

export async function POST(request: Request): Promise<Response> {
  return handleAnthropicMessages(request, getGatewayDeps(after));
}
