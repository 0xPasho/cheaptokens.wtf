import type { GatewayDeps } from "./types";

/**
 * `POST /v1/chat/completions` completo (docs/03-arquitectura.md › Flujo de un request al gateway, ADR-0033).
 * El route handler solo arma `deps` y llama a esta función.
 *
 * Contrato de la ola 0. La implementación es del paquete L (docs/15-plan-gateway.md).
 */
export async function handleChatCompletion(request: Request, deps: GatewayDeps): Promise<Response> {
  void request;
  void deps;
  return Response.json(
    { error: { message: "Not implemented yet.", type: "upstream_error", code: "upstream_error" } },
    { status: 501 },
  );
}
