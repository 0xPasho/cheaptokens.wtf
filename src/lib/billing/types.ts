import type { Db } from "@/lib/db/types";
import type { MicroUsd } from "@/lib/gateway/types";

/** `requests.status` (docs/09-modelo-de-datos.md › requests). */
export type RequestStatus = "success" | "client_cancelled" | "upstream_error" | "upstream_timeout" | "invalid_request";

/** Una fila de `requests`. Nunca lleva contenido (ADR-0014). */
export interface RequestRecord {
  /** UUID v7. Público como `req_<id sin guiones>`. */
  id: string;
  workspaceId: string;
  apiKeyId: string;
  modelId: string;
  /** Interno: nunca se muestra al cliente. Null si ningún upstream respondió. */
  upstreamId: string | null;
  attempts: number;
  stream: boolean;
  status: RequestStatus;
  httpStatus: number;
  errorCode: string | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number | null;
  usageEstimated: boolean;
  /** Lo que se le cobra al cliente, con el mínimo de ADR-0030. */
  costMicroUsd: MicroUsd;
  upstreamCostMicroUsd: MicroUsd;
  officialCostMicroUsd: MicroUsd;
  ttfbMs: number | null;
  latencyMs: number;
}

/**
 * Una sola transacción (docs/08 › Cobro por request, ADR-0049): reparte el costo plan → paquete → créditos,
 * actualiza ventanas, paquete y `workspaces.balance_micro_usd` con lo que le toca a cada uno, inserta en
 * `requests` con el reparto y suma el costo a `api_keys.spent_micro_usd` y `last_used_at`.
 */
export type ChargeRequest = (db: Db, record: RequestRecord, now?: number) => Promise<void>;

/** Ajuste manual de saldo (`credit_transactions.type = 'adjustment'`), con nota obligatoria. */
export type GrantCredits = (
  db: Db,
  input: { workspaceId: string; amountMicroUsd: MicroUsd; note: string },
) => Promise<void>;
