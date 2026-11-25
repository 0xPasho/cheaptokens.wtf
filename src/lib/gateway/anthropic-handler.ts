import type { RequestRecord, RequestStatus } from "@/lib/billing/types";
import { countRun, deskaRun } from "@/lib/partner/runs";

import { chargeThenRelease, type HoldState, reserveRequest } from "./admission";
import {
  ANTHROPIC_ERRORS, ANTHROPIC_PING, anthropicErrorBody, anthropicErrorResponse, authorizationFromHeaders, countMessageTokens,
  createMessagesUsageAccumulator, DEFAULT_ANTHROPIC_VERSION, encodeAnthropicEvent, estimateMessagesPromptTokens,
  messageOutputLength, messagesPromptLength, type MessagesContext, MID_STREAM_FAILURE, modelCandidates, sanitizeMessage, sanitizeStreamEvent,
  validateMessagesRequest,
} from "./anthropic";
import { authenticate, checkAccount } from "./authenticate";
import { readBody, recordRequest, UPSTREAM_DURATION_MS } from "./handler";
import { computeRequestCosts, estimateTokens } from "./metering";
import { type RequestShape, withOutputLimit } from "./request-cost";
import { callUpstream } from "./select-upstream";
import {
  type CatalogSnapshot, type GatewayDeps, type GatewayErrorCode, type GatewayModel,
  type UpstreamResult, type Usage,
} from "./types";

/** Cada cuánto se manda un `ping` si no salió nada: Cloudflare corta a los 100 s sin bytes (docs/18). */
const KEEP_ALIVE_MS = 15_000;
/** Un header del formato más largo que esto no es de un cliente real. */
const MAX_FORMAT_HEADER_LENGTH = 1_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicIds(deps: GatewayDeps) {
  const id = deps.newId();
  const compact = id.replaceAll("-", "");
  return { id, requestId: `req_${compact}`, messageId: `msg_${compact}` };
}

/** El gateway solo responde en el host de la API (ADR-0026). */
function wrongHost(request: Request, deps: GatewayDeps): boolean {
  return deps.env.apiHost !== null && request.headers.get("host")?.toLowerCase() !== deps.env.apiHost.toLowerCase();
}

/** El primer modelo del catálogo que coincide con el nombre: el de Anthropic (`claude-sonnet-5-5`) o el nuestro. */
export function findMessagesModel(catalog: CatalogSnapshot, name: string): GatewayModel | undefined {
  for (const candidate of modelCandidates(name)) {
    const model = catalog.getModel(candidate);
    if (model) return model;
  }
  return undefined;
}

/** `anthropic-version` y `anthropic-beta` del cliente, tal cual. Un beta desconocido lo decide el modelo, no el gateway. */
function formatHeaders(request: Request): Record<string, string> {
  const header = (name: string) => {
    const value = request.headers.get(name)?.trim();
    return value && value.length <= MAX_FORMAT_HEADER_LENGTH ? value : null;
  };
  const beta = header("anthropic-beta");
  return { "anthropic-version": header("anthropic-version") ?? DEFAULT_ANTHROPIC_VERSION, ...(beta ? { "anthropic-beta": beta } : {}) };
}

/** `POST /anthropic/v1/messages` (ADR-0078): el formato de Anthropic sobre el mismo cobro que `/v1/chat/completions`. */
export async function handleAnthropicMessages(request: Request, deps: GatewayDeps): Promise<Response> {
  const ids = publicIds(deps);
  const hold: HoldState = { release: () => {}, scheduled: false };
  try {
    return await processMessages(request, deps, ids, hold);
  } catch {
    if (!hold.scheduled) hold.release();
    deps.log.error("gateway_failed", { requestId: ids.requestId, api: "messages" });
    return anthropicErrorResponse("upstream_error", { requestId: ids.requestId });
  }
}

async function processMessages(
  request: Request, deps: GatewayDeps, ids: ReturnType<typeof publicIds>, hold: HoldState,
): Promise<Response> {
  const { id, requestId } = ids;
  const startedAt = deps.now();
  const reject = (code: GatewayErrorCode, options: { message?: string; retryAfterSeconds?: number; status?: number } = {}) =>
    anthropicErrorResponse(code, { requestId, ...options });

  if (wrongHost(request, deps)) return reject("model_not_found", { message: "Not found." });
  let rawBody: string | null;
  try {
    rawBody = await readBody(request);
  } catch {
    return reject("invalid_request");
  }
  if (rawBody === null) return reject("request_too_large");

  // Antes de leer saldos: lo que otros requests liberen después todavía no está en lo que leamos (ADR-0066).
  const holdMark = deps.holds.mark();
  const auth = await authenticate(authorizationFromHeaders(request.headers), deps.db, deps.now());
  if (!auth.ok) return reject(auth.code);
  const { context } = auth;
  const rate = await deps.rateLimiter.limit(context.workspaceId, context.rateLimitRpm ?? deps.env.rateLimitRpm);
  if (!rate.ok) return reject("rate_limit_exceeded", { retryAfterSeconds: rate.retryAfterSeconds });
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return reject("invalid_request", { message: "The request body is not valid JSON." });
  }
  const validated = validateMessagesRequest(parsed);
  if (!validated.ok) return reject("invalid_request", { message: validated.message });
  const model = findMessagesModel(await deps.catalog(), validated.model);
  if (!model) return reject("model_not_found");
  if (model.status === "retired") return reject("model_retired");
  const accountError = checkAccount(context, model.id);
  if (accountError) return reject(accountError);

  const shape: RequestShape = {
    promptTokens: estimateMessagesPromptTokens(rawBody, validated.body, model.contextLength),
    requestedOutputTokens: validated.maxTokens,
    choices: 1,
  };
  // Sin recorte: si no alcanza para los `max_tokens` pedidos, error claro en vez de una respuesta cortada.
  const reservation = await reserveRequest({ deps, context, model, shape, holdMark, hold, fullOutput: true });
  if (!reservation.ok) {
    return reject(reservation.code, { message: reservation.message, retryAfterSeconds: reservation.retryAfterSeconds });
  }
  // Solo se baja `max_tokens` si pasa de lo que el modelo puede generar: el resultado es el mismo.
  const upstreamBody = reservation.maxOutputTokens < validated.maxTokens
    ? withOutputLimit(validated.body, reservation.maxOutputTokens)
    : validated.body;
  const responseHeaders = { ...reservation.usageHeaders, "request-id": requestId, "x-request-id": requestId };
  const ctx: MessagesContext = { id: ids.messageId, model: validated.model };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.max(0, UPSTREAM_DURATION_MS - (deps.now() - startedAt)));
  let attemptedTarget: UpstreamResult["target"] = null;
  let attempts = 0;
  let result: UpstreamResult;
  try {
    result = await callUpstream({
      model, body: upstreamBody, stream: validated.stream, api: "messages", headers: formatHeaders(request),
      now: deps.now, log: deps.log, signal: abort.signal, fetch: deps.fetch, accounts: deps.accounts,
      onAttempt: (target) => {
        attempts++;
        attemptedTarget = target;
      },
    });
  } catch {
    result = {
      ok: false, attempts, target: attemptedTarget, failure: null, clientMessage: null,
      errorCode: abort.signal.aborted ? "upstream_timeout" : "upstream_error",
    };
  }
  const baseRecord = {
    id, workspaceId: context.workspaceId, apiKeyId: context.apiKeyId, modelId: model.id,
    upstreamId: result.target?.upstreamId ?? null, attempts: result.attempts, stream: validated.stream,
  };
  // Corridas por plan de socio y mes (docs/17), igual que en `/v1/chat/completions`.
  const run = deskaRun(request.headers);
  if (run) {
    deps.after(() => countRun(deps.db, context.workspaceId, run, deps.now()).catch(() => deps.log.error("run_count_failed", { requestId })));
  }
  if (!result.ok) {
    clearTimeout(timer);
    const code = result.errorCode;
    const record: RequestRecord = {
      ...baseRecord, status: code === "invalid_request" || code === "upstream_timeout" ? code : "upstream_error",
      httpStatus: ANTHROPIC_ERRORS[code].status, errorCode: code,
      promptTokens: 0, completionTokens: 0, cachedTokens: null, usageEstimated: false,
      costMicroUsd: BigInt(0), upstreamCostMicroUsd: BigInt(0), officialCostMicroUsd: BigInt(0),
      ttfbMs: null, latencyMs: deps.now() - startedAt,
    };
    chargeThenRelease(deps, hold, () => recordRequest(deps, record, requestId));
    return reject(code, { message: result.clientMessage ?? undefined });
  }

  const accumulator = createMessagesUsageAccumulator();
  const promptChars = messagesPromptLength(validated.body);
  let outputChars = 0;
  // La salida final llega en `message_delta`; sin respuesta completa ni ese evento, solo está la de `message_start`.
  let finalOutput = !validated.stream;
  // Sin `usage` del upstream, se estima con caracteres ÷ 4 (ADR-0013), como en el formato OpenAI.
  const usage = (): Usage => {
    const measured = accumulator.result();
    const generated = estimateTokens(outputChars);
    if (!measured) {
      return {
        promptTokens: estimateTokens(promptChars), completionTokens: generated,
        cachedTokens: null, reasoningTokens: null, upstreamCostMicroUsd: accumulator.upstreamCost(), estimated: true,
      };
    }
    // Un stream que se corta antes de `message_delta` reporta 1 token de salida: se cobra lo que de verdad se generó.
    if (!finalOutput && generated > measured.completionTokens) return { ...measured, completionTokens: generated, estimated: true };
    return measured;
  };
  const target = result.target;
  const ttfbMs = deps.now() - startedAt;
  let finishedAt = deps.now();
  const chargeTask = (status: RequestStatus, measured: Usage, httpStatus = 200): (() => Promise<void>) => {
    const errorCode: GatewayErrorCode | null = status === "upstream_error" || status === "upstream_timeout" ? status : null;
    const record = {
      ...baseRecord, status, httpStatus, errorCode,
      promptTokens: measured.promptTokens, completionTokens: measured.completionTokens,
      cachedTokens: measured.cachedTokens, usageEstimated: measured.estimated,
      ttfbMs, latencyMs: finishedAt - startedAt,
    };
    return async () => {
      try {
        await recordRequest(deps, { ...record, ...computeRequestCosts({ usage: measured, model, target }) }, requestId);
      } catch {
        deps.log.error("charge_failed", { requestId });
      }
    };
  };

  if (!result.stream) {
    let response: Response;
    let status: RequestStatus = "success";
    try {
      if (!isObject(result.body)) throw new Error("Invalid message");
      accumulator.observe(result.body);
      outputChars = messageOutputLength(result.body);
      response = Response.json(sanitizeMessage(result.body, ctx), { headers: responseHeaders });
    } catch {
      status = "upstream_error";
      response = reject("upstream_error");
    } finally {
      clearTimeout(timer);
      finishedAt = deps.now();
    }
    chargeThenRelease(deps, hold, chargeTask(status, usage(), response.status));
    return response;
  }

  let cancelled = request.signal.aborted;
  const disconnect = () => { cancelled = true; };
  request.signal.addEventListener("abort", disconnect, { once: true });
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { disconnect(); },
  });
  const encoder = new TextEncoder();
  let lastSentAt = deps.now();
  let clientClosed = false;
  const send = (text: string) => {
    if (cancelled || clientClosed) return;
    controller.enqueue(encoder.encode(text));
    lastSentAt = deps.now();
  };
  // Un turno de agente puede pensar minutos sin emitir nada: el ping mantiene viva la conexión.
  const keepAlive = setInterval(() => {
    if (deps.now() - lastSentAt >= KEEP_ALIVE_MS) send(ANTHROPIC_PING);
  }, KEEP_ALIVE_MS);
  const closeClient = () => {
    clearInterval(keepAlive);
    if (!cancelled && !clientClosed) controller.close();
    clientClosed = true;
  };
  const events = result.events;
  let status: RequestStatus = "success";
  // El bombeo no depende de pull: cancelar al cliente nunca cancela al upstream (ADR-0013).
  const pumping = (async () => {
    let stopped = false;
    let errorSent = false;
    try {
      for await (const event of events) {
        if (event.type === "comment") { if (!stopped) send(ANTHROPIC_PING); continue; }
        const payload: unknown = JSON.parse(event.data);
        if (!isObject(payload)) throw new Error("Invalid stream payload");
        // El `usage` se lee también después de `message_stop`: el costo puede llegar al final.
        accumulator.observe(payload);
        if (payload.type === "message_delta" && isObject(payload.usage)) finalOutput = true;
        if (stopped) continue;
        outputChars += messageOutputLength(payload);
        if (payload.type === "error") {
          status = "upstream_error";
          const overloaded = isObject(payload.error) && payload.error.type === "overloaded_error";
          send(encodeAnthropicEvent(overloaded
            ? anthropicErrorBody("no_upstream_available")
            : anthropicErrorBody("upstream_error", MID_STREAM_FAILURE)));
          errorSent = true;
          break;
        }
        const clean = sanitizeStreamEvent(payload, ctx);
        if (clean !== null) send(encodeAnthropicEvent(clean));
        if (payload.type === "message_stop") {
          stopped = true;
          // El cliente termina aquí aunque el upstream tarde en cerrar: lo que quede se lee solo por el costo.
          closeClient();
        }
      }
      if (!stopped && status === "success") status = "upstream_error";
    } catch {
      status = abort.signal.aborted ? "upstream_timeout" : "upstream_error";
    }
    try {
      if (abort.signal.aborted) status = "upstream_timeout";
      if (status !== "success" && !errorSent) {
        send(encodeAnthropicEvent(status === "upstream_timeout"
          ? anthropicErrorBody("upstream_timeout")
          : anthropicErrorBody("upstream_error", MID_STREAM_FAILURE)));
      }
    } catch {
      status = abort.signal.aborted ? "upstream_timeout" : "upstream_error";
    } finally {
      clearTimeout(timer);
      finishedAt = deps.now();
      request.signal.removeEventListener("abort", disconnect);
      closeClient();
    }
  })();
  chargeThenRelease(deps, hold, async () => {
    try {
      await pumping;
    } finally {
      await chargeTask(cancelled && status !== "upstream_timeout" ? "client_cancelled" : status, usage())();
    }
  });
  return new Response(stream, {
    headers: {
      ...responseHeaders,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      // nginx ya va sin buffer (deploy/nginx.conf); esto lo asegura en cualquier proxy que lo respete.
      "x-accel-buffering": "no",
    },
  });
}

/**
 * `POST /anthropic/v1/messages/count_tokens`: una estimación local, sin llamar al modelo ni cobrar (ADR-0078).
 * Pide una key válida y un modelo del catálogo, como Anthropic.
 */
export async function handleAnthropicCountTokens(request: Request, deps: GatewayDeps): Promise<Response> {
  const { requestId } = publicIds(deps);
  const reject = (code: GatewayErrorCode, message?: string) => anthropicErrorResponse(code, { requestId, message });
  try {
    if (wrongHost(request, deps)) return reject("model_not_found", "Not found.");
    const rawBody = await readBody(request);
    if (rawBody === null) return reject("request_too_large");
    const auth = await authenticate(authorizationFromHeaders(request.headers), deps.db, deps.now());
    if (!auth.ok) return reject(auth.code);
    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return reject("invalid_request", "The request body is not valid JSON.");
    }
    if (!isObject(body) || typeof body.model !== "string") return reject("invalid_request", "model: Field required.");
    if (!Array.isArray(body.messages) || body.messages.length === 0) return reject("invalid_request", "messages: Field required and must not be empty.");
    const model = findMessagesModel(await deps.catalog(), body.model);
    if (!model) return reject("model_not_found");
    return Response.json(
      { input_tokens: countMessageTokens(rawBody, body) },
      { headers: { "request-id": requestId, "x-request-id": requestId } },
    );
  } catch {
    return reject("upstream_error");
  }
}
