/**
 * Contratos del gateway (ola 0 de docs/15-plan-gateway.md, ADR-0033).
 *
 * Todo paquete que exporta algo que otro paquete usa implementa la firma que está aquí.
 * Cambiar este archivo es cambiar el contrato: solo lo hace el planificador.
 *
 * Reglas que aplican a todo `src/lib/gateway/`:
 * - No importa `next/*`, React, Clerk ni diccionarios. Lo que viene del entorno llega en `GatewayDeps`.
 * - El dinero va en bigint, en µUSD (ADR-0007). Los floats solo aparecen al leer `usage.cost`.
 * - Nada del upstream llega al cliente: ni headers, ni IDs, ni campos fuera de la whitelist (docs/07 › Ocultar el upstream).
 */
import type { Admission, AdmissionFailure, BillingSource, OverflowSettings, PlanUsage } from "@/lib/billing/limits";
import type { ModelStatus } from "@/lib/catalog/types";
import type { Db } from "@/lib/db/types";
import type { RateLimiter } from "@/lib/rate-limit/types";

/** Micro-dólares (1 USD = 1,000,000 µUSD). */
export type MicroUsd = bigint;

// ─── Errores públicos (docs/04-api.md › Errores) ──────────────────────────────

export const GATEWAY_ERROR_STATUS = {
  invalid_request: 400,
  invalid_api_key: 401,
  insufficient_credits: 402,
  no_active_plan: 402,
  key_limit_exceeded: 403,
  account_suspended: 403,
  model_not_allowed_for_key: 403,
  model_not_found: 404,
  model_retired: 410,
  request_too_large: 413,
  rate_limit_exceeded: 429,
  usage_limit_reached: 429,
  upstream_error: 502,
  no_upstream_available: 503,
  upstream_timeout: 504,
} as const;

export type GatewayErrorCode = keyof typeof GATEWAY_ERROR_STATUS;

/** Cuerpo de error con formato OpenAI. Los mensajes van en inglés y nunca nombran al upstream. */
export interface GatewayErrorBody {
  error: { message: string; type: GatewayErrorCode; code: GatewayErrorCode };
}

// ─── Catálogo en memoria (paquete K) ──────────────────────────────────────────

/**
 * Un upstream listo para llamar. Lo arma el snapshot del catálogo a partir de `upstreams` y `model_upstreams`.
 * `baseUrl` sale de la base, salvo que exista la env var `UPSTREAM_<ID>_BASE_URL`
 * (ID en mayúsculas, con todo lo que no sea letra o número como `_`): así los tests apuntan el mock a su puerto.
 */
export interface UpstreamTarget {
  upstreamId: string;
  /** Sin `/` final. Ejemplo: `https://api.inferhub.dev/v1`. */
  baseUrl: string;
  /**
   * Una key por cuenta, resueltas desde `api_key_env` (separadas por comas). Nunca se loguean.
   * Vacía en el mock: el request va sin `Authorization`. Cuáles se usan y en qué orden lo decide `UpstreamAccounts`.
   */
  apiKeys: readonly string[];
  upstreamModel: string;
  costInputPer1M: MicroUsd;
  costOutputPer1M: MicroUsd;
  priority: number;
  /** Manda `x-max-input-price` / `x-max-output-price` con el costo del mapeo (ADR-0028). */
  sendsPriceCap: boolean;
}

/** Un modelo como lo usa el gateway. */
export interface GatewayModel {
  id: string;
  status: ModelStatus;
  /** Tiene el tag `reasoning`: usa el timeout de primer byte largo. */
  isReasoning: boolean;
  /** Precio cheapllm.wtf, µUSD por 1M. */
  inputPricePer1M: MicroUsd;
  outputPricePer1M: MicroUsd;
  /** Precio oficial, µUSD por 1M. Para `official_cost_micro_usd`. */
  officialInputPer1M: MicroUsd;
  officialOutputPer1M: MicroUsd;
  /** Tokens de contexto: acota el prompt y la salida que se reservan (ADR-0066). */
  contextLength: number;
  /** Salida máxima del modelo si se conoce (`models.max_output_tokens`). Null: la por defecto del gateway. */
  maxOutputTokens: number | null;
  /** Ya filtrados (`enabled` y sin `ops_disabled_at`) y ordenados por `priority`. */
  upstreams: readonly UpstreamTarget[];
}

export interface CatalogSnapshot {
  /** `now()` del momento en que se cargó. */
  readonly loadedAt: number;
  getModel(id: string): GatewayModel | undefined;
}

/** Devuelve el snapshot cacheado (60 s) o carga uno nuevo. */
export type CatalogSource = () => Promise<CatalogSnapshot>;

// ─── SSE (paquete D) ──────────────────────────────────────────────────────────

/** Un evento del stream del upstream. Los comentarios se reducen a su tipo: su texto se descarta siempre. */
export type SseEvent = { type: "data"; data: string } | { type: "comment" };

/** Parser incremental: aguanta chunks partidos a mitad de línea y a mitad de un carácter UTF-8. */
export interface SseParser {
  push(chunk: Uint8Array): SseEvent[];
  /** Vacía lo que quede en el buffer al terminar el stream. */
  flush(): SseEvent[];
}

/** Lo que el gateway pone en cada respuesta y chunk que sale hacia el cliente. */
export interface ResponseContext {
  /** `chatcmpl-req_…` */
  id: string;
  /** ID de cheapllm.wtf que pidió el cliente. */
  model: string;
  /** Segundos Unix. */
  created: number;
}

// ─── Medición (paquete F) ─────────────────────────────────────────────────────

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  /** De `usage.cost` (USD) convertido hacia arriba. Null si el upstream no lo reporta. */
  upstreamCostMicroUsd: MicroUsd | null;
  /** True si no llegó `usage` y se estimó con caracteres ÷ 4 (ADR-0013). */
  estimated: boolean;
}

/**
 * Junta el `usage` de todos los chunks. InferHub manda dos al final del stream:
 * el del vendedor (tokens con detalle) y el suyo (con `cost`). Ver tests/fixtures/inferhub/.
 */
export interface UsageAccumulator {
  /** Recibe cada respuesta o chunk ya parseado (JSON del upstream, sin sanear). */
  observe(payload: unknown): void;
  /** Null si ningún payload traía `usage`. */
  result(): Usage | null;
}

// ─── Upstream y fallback (paquete H) ──────────────────────────────────────────

export type UpstreamFailure =
  | { kind: "network" }
  | { kind: "timeout"; phase: "connect" | "first_byte" }
  /** `code` es `error.code` del body cuando existe, por ejemplo `no_provider_under_bid`. */
  | { kind: "http"; status: number; code: string | null }
  /** HTTP 200 con un chunk `error` antes del primer chunk de datos, o un stream sin contenido ni `usage`. */
  | { kind: "stream_error" };

export interface UpstreamTimeouts {
  connectMs: number;
  firstByteMs: number;
  firstByteReasoningMs: number;
}

export interface CallUpstreamOptions {
  model: GatewayModel;
  /** Body del cliente ya validado. `callUpstream` reemplaza `model`, fuerza `stream_options.include_usage` si es stream y no lo muta. */
  body: Readonly<Record<string, unknown>>;
  stream: boolean;
  fetch: typeof fetch;
  now: () => number;
  log: Logger;
  /** Se aborta si vence `maxDuration`. La desconexión del cliente NO aborta: el stream se drena (ADR-0013). */
  signal?: AbortSignal;
  timeouts?: Partial<UpstreamTimeouts>;
  /** Default 3 (docs/07 › Selección y fallback). Cuenta cada request al upstream, también el reintento con otra cuenta. */
  maxAttempts?: number;
  /** Rotación de cuentas. Sin ella, las keys se prueban en el orden escrito y ninguna se pausa. */
  accounts?: UpstreamAccounts;
  /** Se llama antes de cada intento: así quien llama sabe a qué upstream se le estaba pidiendo si el request se aborta. */
  onAttempt?: (target: UpstreamTarget) => void;
}

/**
 * Reparte los requests entre las cuentas de cada upstream (docs/07 › Varias cuentas por upstream).
 * Las cuentas se identifican por su posición en `apiKeys`. El estado vive en memoria, por instancia.
 */
export interface UpstreamAccounts {
  /** Orden en que este request prueba las `count` cuentas del upstream: cada request empieza en la siguiente y las pausadas van al final. */
  order(upstreamId: string, count: number): number[];
  /** La cuenta falló por algo suyo (key, saldo o rate limit): las demás van primero durante `ms`. */
  pause(upstreamId: string, index: number, ms: number): void;
}

export type UpstreamResult =
  | {
      ok: true;
      stream: true;
      target: UpstreamTarget;
      attempts: number;
      ttfbMs: number;
      /** Incluye los eventos que ya se leyeron para confirmar el primer chunk de datos. */
      events: AsyncIterable<SseEvent>;
    }
  | {
      ok: true;
      stream: false;
      target: UpstreamTarget;
      attempts: number;
      ttfbMs: number;
      /** JSON del upstream, sin sanear. */
      body: unknown;
    }
  | {
      ok: false;
      attempts: number;
      /** Último upstream intentado, o null si el modelo no tenía ninguno. */
      target: UpstreamTarget | null;
      failure: UpstreamFailure | null;
      errorCode: Extract<GatewayErrorCode, "invalid_request" | "upstream_error" | "upstream_timeout" | "no_upstream_available">;
      /** Solo en `invalid_request`: el mensaje del upstream ya saneado (qué parámetro falló, sin nombres ni IDs). */
      clientMessage: string | null;
    };

export type CallUpstream = (options: CallUpstreamOptions) => Promise<UpstreamResult>;

// ─── Autenticación (paquete I) ────────────────────────────────────────────────

export interface AuthContext {
  apiKeyId: string;
  workspaceId: string;
  balanceMicroUsd: MicroUsd;
  spendLimitMicroUsd: MicroUsd | null;
  spentMicroUsd: MicroUsd;
  suspended: boolean;
  /** Override del workspace, o el del plan activo. Null = valor global. */
  rateLimitRpm: number | null;
  /** De dónde cobra la key (ADR-0049). */
  billingSource: BillingSource;
  /** Null: todos los modelos. */
  allowedModels: readonly string[] | null;
  /** Plan activo con sus ventanas, leídos en la misma query. Null sin plan. */
  plan: PlanUsage | null;
  overflow: OverflowSettings;
}

export type AuthResult = { ok: true; context: AuthContext } | { ok: false; code: "invalid_api_key" };

/** Header `Authorization` → validación local → una sola query (docs/05-api-keys.md › Usar). */
export type Authenticate = (authorization: string | null, db: Db, now?: number) => Promise<AuthResult>;

/** Suspensión, modelos permitidos y límite de la key (docs/08 › Cobro por request). Null si puede pasar. */
export type CheckAccount = (
  context: AuthContext,
  modelId: string,
) => Extract<GatewayErrorCode, "key_limit_exceeded" | "account_suspended" | "model_not_allowed_for_key"> | null;

/**
 * Una admisión con lo máximo que se le puede cobrar al request sin absorber nada ni dejar saldo negativo.
 * `planOnly`: el plan alcanzaba solo, así que el presupuesto no incluye paquetes ni excedente de socio.
 */
export type BudgetedAdmission = (Extract<Admission, { ok: true }> & { budgetMicroUsd: MicroUsd; planOnly: boolean }) | AdmissionFailure;

/**
 * Plan, paquetes y créditos (ADR-0049, ADR-0066). `planMustCoverMicroUsd` es lo que el plan tiene que cubrir
 * solo para saltarse las consultas de paquetes y de excedente de socio: lo máximo que puede costar el request
 * más lo que ya reservan los requests en curso. Con `null` se consultan siempre.
 */
export type AdmitUsage = (context: AuthContext, modelId: string, db: Db, now: number, planMustCoverMicroUsd: MicroUsd | null) => Promise<BudgetedAdmission>;

// ─── Reservas (ADR-0066) ──────────────────────────────────────────────────────

/** Lo reservado por los requests en curso. En memoria y por instancia, como el rate limiter. */
export interface HoldBook {
  /** Se toma antes de leer saldos de la base. */
  mark(): number;
  /** Lo reservado ahora por el workspace y por la key, más lo liberado después de `since`: la base leída antes aún no lo refleja. */
  held(workspaceId: string, apiKeyId: string, since: number): { workspace: MicroUsd; key: MicroUsd };
  /** Reserva `amount` para el workspace y la key. Devuelve la función que la libera; llamarla otra vez no hace nada. */
  hold(workspaceId: string, apiKeyId: string, amount: MicroUsd): () => void;
}

// ─── Logger ───────────────────────────────────────────────────────────────────

/** Solo primitivos: así no se puede loguear un body o un objeto con la key por accidente. */
export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  /** Las alertas de upstream van aquí con `severity: "critical" | "warning"`. */
  error(event: string, fields?: LogFields): void;
}

// ─── Dependencias del handler (ADR-0033) ──────────────────────────────────────

export interface GatewayDeps {
  db: Db;
  rateLimiter: RateLimiter;
  /** Una por instancia: las reservas de todos los requests en curso (ADR-0066). */
  holds: HoldBook;
  catalog: CatalogSource;
  /** Una por instancia, igual que el rate limiter: la rotación y las pausas se comparten entre requests. */
  accounts: UpstreamAccounts;
  fetch: typeof fetch;
  /** `after()` de Next en producción. En pruebas, guarda la tarea para esperarla. */
  after: (task: () => Promise<void>) => void;
  /** Milisegundos Unix. */
  now: () => number;
  /** UUID v7 (ADR del modelo de datos). Inyectado para que las pruebas sean deterministas. */
  newId: () => string;
  log: Logger;
  env: {
    isProduction: boolean;
    /** Si existe, el gateway responde 404 a requests que lleguen por otro host (ADR-0026). */
    apiHost: string | null;
    /** Rate limit global por workspace, requests por minuto (ADR-0017). */
    rateLimitRpm: number;
  };
}
