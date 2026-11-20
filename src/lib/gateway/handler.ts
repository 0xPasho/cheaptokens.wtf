import { chargeRequest } from "@/lib/billing/ledger";
import type { RequestRecord, RequestStatus } from "@/lib/billing/types";
import { countRun, deskaRun } from "@/lib/partner/runs";

import { planUsageHeaders } from "@/lib/billing/headers";
import { budgetShortfall } from "@/lib/billing/limits";

import { admitUsage, authenticate, checkAccount } from "./authenticate";
import { errorResponse, HOLD_MESSAGES, streamErrorChunk } from "./errors";
import { computeRequestCosts, createUsageAccumulator, estimateTokens } from "./metering";
import { estimatePromptTokens, type RequestShape, sizeHold, withOutputLimit } from "./request-cost";
import { buildUsageChunk, sanitizeChunk, sanitizeCompletion } from "./sanitize";
import { callUpstream } from "./select-upstream";
import { encodeSseData, SSE_DONE, SSE_KEEP_ALIVE } from "./sse";
import { GATEWAY_ERROR_STATUS, type GatewayDeps, type GatewayErrorCode, type UpstreamResult, type Usage } from "./types";
import { validateChatRequest } from "./validate";

const MAX_BODY_BYTES = 4_500_000;
const UPSTREAM_DURATION_MS = 790_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textLength(value: unknown): number {
  return typeof value === "string" ? Array.from(value).length : 0;
}

function promptLength(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  let count = 0;
  for (const message of messages) {
    if (!isObject(message)) continue;
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (isObject(part)) count += textLength(part.text);
      }
    } else count += textLength(message.content);
  }
  return count;
}

function measureOutput(payload: unknown, field: "message" | "delta"): { characters: number; hasContent: boolean } {
  if (!isObject(payload) || !Array.isArray(payload.choices)) return { characters: 0, hasContent: false };
  let count = 0;
  let hasTools = false;
  for (const choice of payload.choices) {
    if (!isObject(choice)) continue;
    const message = choice[field];
    if (!isObject(message)) continue;
    count += textLength(message.content) + textLength(message.reasoning_content);
    if (Array.isArray(message.tool_calls)) {
      hasTools ||= message.tool_calls.length > 0;
      for (const call of message.tool_calls) {
        if (isObject(call) && isObject(call.function)) {
          count += textLength(call.function.name) + textLength(call.function.arguments);
        }
      }
    }
  }
  return { characters: count, hasContent: count > 0 || hasTools };
}

async function readBody(request: Request): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        // No esperamos a que un emisor termine un body que ya excedió el límite.
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function recordRequest(deps: GatewayDeps, record: RequestRecord, requestId: string): Promise<void> {
  try {
    await chargeRequest(deps.db, record, deps.now());
  } catch {
    deps.log.error("charge_failed", { requestId });
  }
  deps.log.info("request_completed", {
    requestId, workspaceId: record.workspaceId, apiKeyId: record.apiKeyId,
    modelId: record.modelId, upstreamId: record.upstreamId, status: record.status,
    httpStatus: record.httpStatus, promptTokens: record.promptTokens, completionTokens: record.completionTokens,
    cachedTokens: record.cachedTokens, usageEstimated: record.usageEstimated,
    ttfbMs: record.ttfbMs, latencyMs: record.latencyMs,
  });
}

/** La reserva del request (ADR-0066): se libera después de su cobro, o al fallar antes de agendarlo. */
interface HoldState {
  release: () => void;
  /** True cuando ya hay una tarea en `after()` que cobra y después libera. */
  scheduled: boolean;
}

export async function handleChatCompletion(request: Request, deps: GatewayDeps): Promise<Response> {
  const id = deps.newId();
  const requestId = `req_${id.replaceAll("-", "")}`;
  const hold: HoldState = { release: () => {}, scheduled: false };
  try {
    return await processChatCompletion(request, deps, id, requestId, hold);
  } catch {
    if (!hold.scheduled) hold.release();
    // Las excepciones internas tampoco deben exponer contenido ni perder el ID público.
    deps.log.error("gateway_failed", { requestId });
    return errorResponse("upstream_error", { requestId });
  }
}

async function processChatCompletion(
  request: Request, deps: GatewayDeps, id: string, requestId: string, hold: HoldState,
): Promise<Response> {
  const startedAt = deps.now();
  const reject = (code: GatewayErrorCode, message?: string) => errorResponse(code, { requestId, message });

  if (deps.env.apiHost !== null && request.headers.get("host")?.toLowerCase() !== deps.env.apiHost.toLowerCase()) {
    const response = reject("invalid_request", "Not found.");
    return new Response(response.body, { status: 404, headers: response.headers });
  }
  let rawBody: string | null;
  try {
    rawBody = await readBody(request);
  } catch {
    return reject("invalid_request");
  }
  if (rawBody === null) return reject("request_too_large");

  // Antes de leer saldos: lo que otros requests liberen después todavía no está en lo que leamos (ADR-0066).
  const holdMark = deps.holds.mark();
  const auth = await authenticate(request.headers.get("authorization"), deps.db, deps.now());
  if (!auth.ok) return reject(auth.code);
  const { context } = auth;
  const rate = await deps.rateLimiter.limit(context.workspaceId, context.rateLimitRpm ?? deps.env.rateLimitRpm);
  if (!rate.ok) {
    return errorResponse("rate_limit_exceeded", { requestId, retryAfterSeconds: rate.retryAfterSeconds });
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return reject("invalid_request");
  }
  const validated = validateChatRequest(body);
  if (!validated.ok) return reject("invalid_request", validated.message);
  const model = (await deps.catalog()).getModel(validated.model);
  if (!model) return reject("model_not_found");
  if (model.status === "retired") return reject("model_retired");
  const accountError = checkAccount(context, model.id);
  if (accountError) return reject(accountError);
  const shape: RequestShape = {
    promptTokens: estimatePromptTokens(rawBody, validated.body, model.contextLength),
    requestedOutputTokens: validated.maxOutputTokens,
    choices: validated.choices,
  };
  const wanted = sizeHold(model, shape, null);
  const admissionNow = deps.now();
  const admission = await admitUsage(context, model.id, deps.db, admissionNow, wanted.ok ? wanted.amountMicroUsd : BigInt(0));
  const retryAfter = (retryAt: number | null) => retryAt === null ? undefined : (retryAt - admissionNow) / 1000;
  if (!admission.ok) {
    return errorResponse(admission.code, { requestId, retryAfterSeconds: retryAfter(admission.retryAt) });
  }
  // Solo se admite lo que cabe en lo que queda, descontado lo que reservan los requests en curso (ADR-0066).
  // Desde aquí hasta `hold()` no hay await: dos requests no pueden reservar el mismo saldo.
  const held = deps.holds.held(context.workspaceId, context.apiKeyId, holdMark);
  const workspaceBudget = admission.budgetMicroUsd - held.workspace;
  const keyBudget = context.spendLimitMicroUsd === null ? null : context.spendLimitMicroUsd - context.spentMicroUsd - held.key;
  const keyBinds = keyBudget !== null && keyBudget < workspaceBudget;
  const size = sizeHold(model, shape, keyBinds ? keyBudget : workspaceBudget);
  if (!size.ok) {
    if (keyBinds) return reject("key_limit_exceeded", HOLD_MESSAGES.key_limit_exceeded);
    const shortfall = budgetShortfall(context.billingSource, context.plan, admissionNow);
    return errorResponse(shortfall.code, {
      requestId, message: HOLD_MESSAGES[shortfall.code], retryAfterSeconds: retryAfter(shortfall.retryAt),
    });
  }
  hold.release = deps.holds.hold(context.workspaceId, context.apiKeyId, size.amountMicroUsd);
  // Cobra y después libera: la reserva sigue contando hasta que el cobro está en la base.
  const afterThenRelease = (task: () => Promise<void>) => {
    hold.scheduled = true;
    deps.after(async () => {
      try {
        await task();
      } finally {
        hold.release();
      }
    });
  };
  // Sin salida fijada, o con más de la que cabe, el upstream recibe el máximo que se reservó.
  const upstreamBody = size.limitsOutput ? withOutputLimit(validated.body, size.maxOutputTokens) : validated.body;
  // Lo que queda del plan antes de este request (ADR-0049). Sin plan, sin headers.
  const usageHeaders = context.billingSource === "prepaid_only" ? {} : planUsageHeaders(context.plan, admissionNow);

  const responseContext = { id: `chatcmpl-${requestId}`, model: model.id, created: Math.floor(startedAt / 1000) };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.max(0, UPSTREAM_DURATION_MS - (deps.now() - startedAt)));
  let attemptedTarget: UpstreamResult["target"] = null;
  let attempts = 0;
  let result: UpstreamResult;
  try {
    result = await callUpstream({
      model, body: upstreamBody, stream: validated.stream, now: deps.now, log: deps.log, signal: abort.signal,
      fetch: deps.fetch, accounts: deps.accounts,
      // Si `maxDuration` aborta, `callUpstream` lanza: esto conserva el intento para el registro.
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
  // Corridas por plan de socio y mes (docs/17): solo el digest de `x-deska-run`, de los requests que se registran.
  const run = deskaRun(request.headers);
  if (run) {
    deps.after(() => countRun(deps.db, context.workspaceId, run, deps.now()).catch(() => deps.log.error("run_count_failed", { requestId })));
  }
  if (!result.ok) {
    clearTimeout(timer);
    const code = result.errorCode;
    const record: RequestRecord = {
      ...baseRecord, status: code === "invalid_request" || code === "upstream_timeout" ? code : "upstream_error",
      httpStatus: GATEWAY_ERROR_STATUS[code], errorCode: code,
      promptTokens: 0, completionTokens: 0, cachedTokens: null, usageEstimated: false,
      costMicroUsd: BigInt(0), upstreamCostMicroUsd: BigInt(0), officialCostMicroUsd: BigInt(0),
      ttfbMs: null, latencyMs: deps.now() - startedAt,
    };
    afterThenRelease(() => recordRequest(deps, record, requestId));
    return reject(code, result.clientMessage ?? undefined);
  }

  const accumulator = createUsageAccumulator();
  const promptChars = promptLength(validated.body.messages);
  let outputChars = 0;
  const usage = (): Usage => accumulator.result() ?? {
    promptTokens: estimateTokens(promptChars), completionTokens: estimateTokens(outputChars),
    cachedTokens: null, reasoningTokens: null, upstreamCostMicroUsd: accumulator.upstreamCost(), estimated: true,
  };
  const target = result.target;
  const ttfbMs = deps.now() - startedAt;
  let finishedAt = deps.now();
  const makeChargeTask = (
    status: RequestStatus, measured: Usage,
    errorCode: GatewayErrorCode | null = status === "upstream_error" || status === "upstream_timeout" ? status : null,
    httpStatus = 200,
  ): (() => Promise<void>) => {
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
      accumulator.observe(result.body);
      outputChars = measureOutput(result.body, "message").characters;
      response = Response.json(sanitizeCompletion(result.body, responseContext), { headers: { ...usageHeaders, "x-request-id": requestId } });
    } catch {
      status = "upstream_error";
      response = reject("upstream_error");
    } finally {
      clearTimeout(timer);
      finishedAt = deps.now();
    }
    afterThenRelease(makeChargeTask(status, usage(), status === "success" ? null : "upstream_error", response.status));
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
  const send = (text: string) => { if (!cancelled) controller.enqueue(encoder.encode(text)); };
  const events = result.events;
  let status: RequestStatus = "success";
  // El bombeo no depende de pull: cancelar al cliente nunca cancela al upstream.
  const pumping = (async () => {
    let done = false;
    let hasContent = false;
    try {
      for await (const event of events) {
        if (event.type === "comment") { send(SSE_KEEP_ALIVE); continue; }
        if (event.data === "[DONE]") { done = true; break; }
        const payload: unknown = JSON.parse(event.data);
        if (!isObject(payload)) throw new Error("Invalid stream payload");
        accumulator.observe(payload);
        const output = measureOutput(payload, "delta");
        outputChars += output.characters;
        hasContent ||= output.hasContent;
        if ("error" in payload) { status = "upstream_error"; break; }
        const chunk = sanitizeChunk(payload, responseContext);
        if (chunk !== null) send(encodeSseData(chunk));
      }
      if (!done || (!hasContent && accumulator.result() === null)) status = "upstream_error";
    } catch {
      status = abort.signal.aborted ? "upstream_timeout" : "upstream_error";
    }
    try {
      if (abort.signal.aborted) status = "upstream_timeout";
      if (validated.includeUsage) send(encodeSseData(buildUsageChunk(usage(), responseContext)));
      if (status !== "success") send(encodeSseData(streamErrorChunk(responseContext)));
      send(SSE_DONE);
    } catch {
      status = abort.signal.aborted ? "upstream_timeout" : "upstream_error";
    } finally {
      clearTimeout(timer);
      finishedAt = deps.now();
      request.signal.removeEventListener("abort", disconnect);
      if (!cancelled) controller.close();
    }
  })();
  afterThenRelease(async () => {
    try {
      await pumping;
    } finally {
      // La cancelación cambia el estado, pero conserva el diagnóstico del upstream.
      const errorCode = status === "upstream_error" || status === "upstream_timeout" ? status : null;
      await makeChargeTask(cancelled && status !== "upstream_timeout" ? "client_cancelled" : status, usage(), errorCode)();
    }
  });
  return new Response(stream, { headers: {
    ...usageHeaders, "content-type": "text/event-stream", "cache-control": "no-cache", "x-request-id": requestId,
  } });
}
