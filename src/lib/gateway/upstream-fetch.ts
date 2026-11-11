import { sanitizeUpstreamClientMessage, upstreamErrorCode } from "./errors";
import { readSseEvents } from "./sse";
import type { CallUpstreamOptions, SseEvent, UpstreamFailure, UpstreamTarget, UpstreamTimeouts } from "./types";

export type UpstreamAttemptResult =
  | { ok: true; stream: true; events: AsyncIterable<SseEvent> }
  | { ok: true; stream: false; body: unknown }
  | { ok: false; failure: UpstreamFailure; clientMessage: string | null };

const DEFAULT_TIMEOUTS: UpstreamTimeouts = {
  connectMs: 10_000,
  firstByteMs: 60_000,
  firstByteReasoningMs: 180_000,
};
const MAX_ERROR_BYTES = 64 * 1024;

function priceCap(microUsd: bigint): string {
  const digits = microUsd.toString().padStart(7, "0");
  const fraction = digits.slice(-6).replace(/0+$/, "");
  return digits.slice(0, -6) + (fraction ? `.${fraction}` : "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readErrorBody(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (bytes < MAX_ERROR_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, MAX_ERROR_BYTES - bytes);
      bytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  } finally {
    reader.releaseLock();
  }
}

// La primera lectura ya ocurrió: se conserva sin volver a consumir ni bufferizar el stream.
function replayFirstEvent(
  first: SseEvent,
  iterator: AsyncIterator<SseEvent>,
  signal: AbortSignal | undefined,
  close: () => void,
): AsyncIterableIterator<SseEvent> {
  let pending: SseEvent | null = first;
  let ended = false;
  return {
    [Symbol.asyncIterator]() { return this; },
    async next() {
      if (ended) return { done: true, value: undefined };
      try {
        signal?.throwIfAborted();
        if (pending) {
          const value = pending;
          pending = null;
          return { done: false, value };
        }
        const result = await iterator.next();
        if (result.done) {
          ended = true;
          close();
        }
        return result;
      } catch (error) {
        ended = true;
        close();
        await iterator.return?.();
        throw error;
      }
    },
    async return() {
      ended = true;
      close();
      await iterator.return?.();
      return { done: true, value: undefined };
    },
  };
}

export async function fetchUpstream(options: CallUpstreamOptions, target: UpstreamTarget): Promise<UpstreamAttemptResult> {
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  let phase: "connect" | "first_byte" | null = null;
  const expire = (value: "connect" | "first_byte") => {
    phase ??= value;
    controller.abort();
  };
  const firstByteTimer = setTimeout(
    () => expire("first_byte"),
    options.model.isReasoning ? timeouts.firstByteReasoningMs : timeouts.firstByteMs,
  );
  const connectTimer = options.stream ? setTimeout(() => expire("connect"), timeouts.connectMs) : undefined;
  const clearTimers = () => {
    clearTimeout(connectTimer);
    clearTimeout(firstByteTimer);
  };
  const close = () => {
    clearTimers();
    options.signal?.removeEventListener("abort", abort);
    // También cancela el resto de un body HTTP que superó el límite de lectura.
    controller.abort();
  };
  let handedOff = false;

  try {
    const body: Record<string, unknown> = { ...options.body, model: target.upstreamModel };
    if (options.stream) {
      const streamOptions = isObject(options.body.stream_options) ? options.body.stream_options : {};
      body.stream_options = { ...streamOptions, include_usage: true };
    }
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (target.apiKey !== "") headers.authorization = `Bearer ${target.apiKey}`;
    if (target.sendsPriceCap) {
      headers["x-max-input-price"] = priceCap(target.costInputPer1M);
      headers["x-max-output-price"] = priceCap(target.costOutputPer1M);
    }
    const response = await options.fetch(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    clearTimeout(connectTimer);

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      return {
        ok: false,
        failure: { kind: "http", status: response.status, code: upstreamErrorCode(errorBody) },
        clientMessage: response.status === 400 || response.status === 422 ? sanitizeUpstreamClientMessage(errorBody) : null,
      };
    }
    if (!options.stream) {
      const payload: unknown = await response.json();
      return { ok: true, stream: false, body: payload };
    }
    if (!response.body) return { ok: false, failure: { kind: "stream_error" }, clientMessage: null };

    const iterator = readSseEvents(response.body)[Symbol.asyncIterator]();
    while (true) {
      const event = await iterator.next();
      if (event.done) return { ok: false, failure: { kind: "stream_error" }, clientMessage: null };
      if (event.value.type === "comment") continue;
      let payload: unknown;
      try {
        payload = JSON.parse(event.value.data) as unknown;
      } catch {
        await iterator.return?.();
        return { ok: false, failure: { kind: "stream_error" }, clientMessage: null };
      }
      if (!isObject(payload) || "error" in payload) {
        await iterator.return?.();
        return { ok: false, failure: { kind: "stream_error" }, clientMessage: null };
      }
      clearTimers();
      handedOff = true;
      return { ok: true, stream: true, events: replayFirstEvent(event.value, iterator, options.signal, close) };
    }
  } catch {
    options.signal?.throwIfAborted();
    if (phase !== null) return { ok: false, failure: { kind: "timeout", phase }, clientMessage: null };
    // El detalle de una excepción puede contener URLs, credenciales o contenido.
    return { ok: false, failure: { kind: "network" }, clientMessage: null };
  } finally {
    if (!handedOff) close();
  }
}
