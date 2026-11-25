import { randomBytes, randomUUID } from "node:crypto";
import { createServer, STATUS_CODES, type IncomingHttpHeaders, type ServerResponse } from "node:http";

import errors from "../fixtures/inferhub/errors.json";

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown | null;
  receivedAt: number;
  clientAborted: boolean;
}

/**
 * Ask default del mock, en USD por 1M. Va por debajo de todo costo de `mock` en catalog/upstreams.ts:
 * con el tope de precio (ADR-0028), un ask mayor haría que el mock rechazara todo con `no_provider_under_bid`.
 */
export const MOCK_DEFAULT_ASK_INPUT_PER_1M = 0.001;
export const MOCK_DEFAULT_ASK_OUTPUT_PER_1M = 0.002;

interface MockUpstreamOptions {
  port?: number;
  askInputPer1M?: number;
  askOutputPer1M?: number;
}

// Las fracciones de µUSD conservan asks pequeños sin aritmética de punto flotante.
interface DecimalMicroUsd {
  units: bigint;
  scale: number;
}

const tokensPerChunk = 4;
const contentChunk = "Hola 🌎. ";
const reasoning = ["We", " need answer in Spanish."];
const toolArgumentChunks = ['{"location":"Ciudad de ', 'México","unit":', '"celsius"}'];

function powerOfTen(exponent: number): bigint {
  return BigInt(10) ** BigInt(exponent);
}

function parsePrice(value: string): DecimalMicroUsd | null {
  const match = /^([+-]?\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  const places = fraction.length - parseInt(match[3] ?? "0", 10) - 6;
  if (!Number.isSafeInteger(places) || Math.abs(places) > 1000) return null;
  return {
    units: BigInt(match[1] + fraction) * powerOfTen(Math.max(0, -places)),
    scale: Math.max(0, places),
  };
}

function atScale(price: DecimalMicroUsd, scale: number): bigint {
  return price.units * powerOfTen(scale - price.scale);
}

function belowAsk(header: string | undefined, ask: DecimalMicroUsd): boolean {
  const bid = header === undefined ? null : parsePrice(header);
  if (!bid) return false;
  const scale = Math.max(bid.scale, ask.scale);
  return atScale(bid, scale) < atScale(ask, scale);
}

function usageCost(prompt: number, completion: number, input: DecimalMicroUsd, output: DecimalMicroUsd): number {
  const priceScale = Math.max(input.scale, output.scale);
  const scale = priceScale + 6;
  const weighted = BigInt(prompt) * atScale(input, priceScale) + BigInt(completion) * atScale(output, priceScale);
  const minimum = BigInt(10) * powerOfTen(scale);
  const microUsd = weighted < minimum ? minimum : weighted;
  const digits = microUsd.toString().padStart(scale + 7, "0");
  const split = digits.length - scale - 6;
  // Solo la frontera JSON usa un número USD, igual que usage.cost de InferHub.
  return JSON.parse(`${digits.slice(0, split)}.${digits.slice(split)}`) as number;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonnegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function promptTokens(body: Record<string, unknown>): number {
  if (!Array.isArray(body.messages)) return 0;
  let characters = 0;
  for (const message of body.messages) {
    const content = object(message).content;
    if (typeof content === "string") characters += [...content].length;
    else if (Array.isArray(content)) {
      for (const part of content) {
        const text = object(part).text;
        if (typeof text === "string") characters += [...text].length;
      }
    }
  }
  return Math.ceil(characters / 4);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed) return;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function event(response: ServerResponse, payload: unknown): void {
  if (!response.destroyed && !response.writableEnded) response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Un evento con nombre, como los manda Anthropic en `/v1/messages`. */
function namedEvent(response: ServerResponse, payload: Record<string, unknown>): void {
  if (!response.destroyed && !response.writableEnded) response.write(`event: ${String(payload.type)}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/** Tokens de prompt de un body de Anthropic: sistema y mensajes, a caracteres ÷ 4. */
function messagesPromptTokens(body: Record<string, unknown>): number {
  let characters = 0;
  const visit = (content: unknown) => {
    if (typeof content === "string") characters += [...content].length;
    else if (Array.isArray(content)) {
      for (const block of content) {
        const text = object(block).text;
        if (typeof text === "string") characters += [...text].length;
      }
    }
  };
  visit(body.system);
  if (Array.isArray(body.messages)) for (const message of body.messages) visit(object(message).content);
  return Math.ceil(characters / 4);
}

/** La firma del bloque de thinking: el gateway tiene que devolverla byte por byte. */
export const MOCK_THINKING_SIGNATURE = "EqQBCkgIARABGAIiQL7sXk/7+eY9mZr0TBUOzKJ5hq0p+v1wzq3uYdW8x2E=";

// Cancelar el temporizador evita dejar tareas vivas después de abortar o cerrar el mock.
function pause(response: ServerResponse, milliseconds: number): Promise<boolean> {
  if (response.destroyed) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (open: boolean) => {
      clearTimeout(timer);
      response.off("close", closed);
      resolve(open);
    };
    const closed = () => finish(false);
    const timer = setTimeout(() => finish(!response.destroyed), milliseconds);
    response.once("close", closed);
  });
}

export async function startMockUpstream(options: MockUpstreamOptions = {}): Promise<{
  baseUrl: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}> {
  const askInput = options.askInputPer1M ?? MOCK_DEFAULT_ASK_INPUT_PER_1M;
  const askOutput = options.askOutputPer1M ?? MOCK_DEFAULT_ASK_OUTPUT_PER_1M;
  const input = parsePrice(askInput.toString());
  const output = parsePrice(askOutput.toString());
  if (!input || !output || input.units < BigInt(0) || output.units < BigInt(0)) {
    throw new RangeError("Mock asks must be finite, nonnegative prices");
  }

  const requests: RecordedRequest[] = [];
  let stopping = false;
  const server = createServer((request, response) => {
    let serverAborted = false;
    const recorded: RecordedRequest = {
      method: request.method ?? "",
      path: request.url ?? "/",
      headers: { ...request.headers },
      body: null,
      receivedAt: Date.now(),
      clientAborted: false,
    };
    requests.push(recorded);
    response.on("close", () => {
      if (!response.writableFinished && !serverAborted && !stopping) recorded.clientAborted = true;
    });
    request.on("aborted", () => { recorded.clientAborted = true; });

    const respond = async () => {
      const buffers: Buffer[] = [];
      for await (const chunk of request) buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const rawBody = Buffer.concat(buffers).toString("utf8");
      try {
        recorded.body = rawBody ? JSON.parse(rawBody) as unknown : null;
      } catch {
        recorded.body = null;
      }
      const path = request.url?.split("?")[0];
      if (request.method !== "POST" || (path !== "/v1/chat/completions" && path !== "/v1/messages")) {
        json(response, 404, errors.model_not_found_404);
        return;
      }
      if (rawBody && recorded.body === null) {
        json(response, 400, { error: { message: "Invalid JSON body", type: "invalid_request_error", source: "inferhub" } });
        return;
      }
      const body = object(recorded.body);
      const control = object(body.x_mock);
      const model = typeof body.model === "string" ? body.model : "alicn/qwen3.8-flash";
      const scenario = request.headers["x-mock-scenario"] ?? (model.startsWith("mock/") ? model.slice(5) : control.scenario) ?? "ok";
      const modelLatency = typeof scenario === "string" ? /^slow-first-byte:(\d+)$/.exec(scenario) : null;
      const chunks = nonnegativeInteger(control.chunks, 3);
      const chunkDelayMs = nonnegativeInteger(control.chunkDelayMs, 0);
      // La latencia del mapeo prevalece sobre el body compartido entre upstreams.
      const latencyMs = modelLatency
        ? nonnegativeInteger(parseInt(modelLatency[1], 10), 2000)
        : nonnegativeInteger(control.latencyMs, scenario === "slow-first-byte" ? 2000 : 0);
      const requestId = randomBytes(8).toString("hex");
      const id = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);

      response.setHeader("x-inferhub-request-id", requestId);
      response.setHeader("x-inferhub-publisher", randomUUID());
      response.setHeader("x-inferhub-model", model);
      response.setHeader("x-inferhub-attempt", "1");
      response.setHeader("x-inferhub-backend", `node-${randomBytes(5).toString("hex")}`);
      response.setHeader("x-ratelimit-limit", "1000");
      response.setHeader("x-ratelimit-remaining", "996");
      response.setHeader("x-ratelimit-reset", (created + 60).toString());

      if (scenario === "reset") {
        serverAborted = true;
        response.destroy();
        return;
      }

      if (belowAsk(request.headers["x-max-input-price"]?.toString(), input)
        || belowAsk(request.headers["x-max-output-price"]?.toString(), output)
        || scenario === "error-402-bid") {
        json(response, 402, {
          error: {
            ...errors.no_provider_under_bid_402.error,
            min_input_per_mtok: askInput.toString(),
            min_output_per_mtok: askOutput.toString(),
          },
        });
        return;
      }
      if (scenario === "hang") return;
      if (latencyMs > 0 && !await pause(response, latencyMs)) return;

      const httpErrors: Record<string, { status: number; body: unknown }> = {
        "error-400": { status: 400, body: { ...errors.publisher_400, id, request_id: requestId } },
        "error-401": { status: 401, body: errors.invalid_api_key_401 },
        "error-402": { status: 402, body: { error: { message: "Insufficient balance", type: "insufficient_credits", source: "inferhub" } } },
        "error-404": { status: 404, body: errors.model_not_found_404 },
        "error-429": { status: 429, body: { error: { message: "Rate limit exceeded", type: "rate_limit_error", source: "inferhub" } } },
        "error-500": { status: 500, body: { error: { message: "Internal server error", type: "server_error", source: "inferhub" } } },
        "error-503": { status: 503, body: { error: { message: "No provider available", type: "server_error", source: "inferhub" } } },
      };
      const statusMatch = typeof scenario === "string" ? /^error-([45]\d{2})$/.exec(scenario) : null;
      const status = statusMatch ? parseInt(statusMatch[1], 10) : null;
      const failure = typeof scenario === "string" && Object.hasOwn(httpErrors, scenario)
        ? httpErrors[scenario]
        : status === null ? undefined : {
          status,
          body: { error: { message: STATUS_CODES[status] ?? `HTTP ${status}`, type: status < 500 ? "invalid_request_error" : "server_error", source: "inferhub" } },
        };
      if (failure) {
        json(response, failure.status, failure.body);
        return;
      }

      if (path === "/v1/messages") {
        await respondMessages();
        return;
      }

      /** `/v1/messages` en el formato de Anthropic, con lo que agrega InferHub: `usage.cost`, `provider`, `request_id`. */
      async function respondMessages(): Promise<void> {
        const cacheRead = nonnegativeInteger(control.cacheRead, 0);
        const cacheWrite = nonnegativeInteger(control.cacheWrite, 0);
        const prompt = messagesPromptTokens(body);
        const text = contentChunk.repeat(chunks);
        const thinking = reasoning.join("");
        const completion = reasoning.length + chunks * tokensPerChunk;
        const cost = usageCost(prompt + cacheRead + cacheWrite, completion, input!, output!);
        const messageId = `msg_upstream_${randomBytes(6).toString("hex")}`;
        const toolUse = scenario === "tool-use";
        const tool = { type: "tool_use", id: "toolu_01A09q90qw90lq917835lq9", name: "get_weather", input: { location: "Ciudad de México", unit: "celsius" } };
        const stopReason = toolUse ? "tool_use" : "end_turn";
        const inputUsage = { input_tokens: prompt, cache_creation_input_tokens: cacheWrite, cache_read_input_tokens: cacheRead };
        const noUsage = scenario === "no-usage";
        if (body.stream !== true) {
          if (scenario === "stream-error-200" || scenario === "mid-stream-error") {
            json(response, 200, { type: "error", error: { type: "api_error", message: "InferHub provider failed" } });
            return;
          }
          if (scenario === "empty-stream") {
            json(response, 200, {});
            return;
          }
          json(response, 200, {
            id: messageId, type: "message", role: "assistant", model, provider: "inferhub", request_id: requestId,
            content: [
              { type: "thinking", thinking, signature: MOCK_THINKING_SIGNATURE },
              toolUse ? tool : { type: "text", text },
            ],
            stop_reason: stopReason, stop_sequence: null,
            ...(noUsage ? {} : { usage: { ...inputUsage, output_tokens: completion, service_tier: "standard", cost } }),
          });
          return;
        }
        response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        response.write(": INFERHUB PROCESSING\n\n");
        if (scenario === "stream-error-200") {
          namedEvent(response, { type: "error", error: { type: "overloaded_error", message: "InferHub provider overloaded" } });
          response.end();
          return;
        }
        namedEvent(response, {
          type: "message_start", provider: "inferhub",
          message: {
            id: messageId, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null,
            ...(noUsage ? {} : { usage: { ...inputUsage, output_tokens: 1 } }),
          },
        });
        namedEvent(response, { type: "ping" });
        namedEvent(response, { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } });
        for (const part of reasoning) namedEvent(response, { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: part } });
        namedEvent(response, { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: MOCK_THINKING_SIGNATURE } });
        namedEvent(response, { type: "content_block_stop", index: 0 });
        if (toolUse) {
          namedEvent(response, { type: "content_block_start", index: 1, content_block: { ...tool, input: {} } });
          for (const part of toolArgumentChunks) {
            namedEvent(response, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: part } });
            if (!await pause(response, chunkDelayMs)) return;
          }
        } else {
          namedEvent(response, { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } });
          for (let index = 0; index < chunks; index++) {
            if (response.destroyed) return;
            namedEvent(response, { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: contentChunk } });
            if (!await pause(response, index < chunks - 1 ? chunkDelayMs : 0)) return;
          }
        }
        if (scenario === "cut") {
          serverAborted = true;
          response.destroy();
          return;
        }
        if (scenario === "mid-stream-error") {
          namedEvent(response, { type: "error", error: { type: "api_error", message: "InferHub provider failed" } });
          response.end();
          return;
        }
        namedEvent(response, { type: "content_block_stop", index: 1 });
        const lateCost = scenario === "late-cost";
        namedEvent(response, {
          type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null },
          ...(noUsage ? {} : { usage: { output_tokens: completion, ...(lateCost ? {} : { cost }) } }),
        });
        namedEvent(response, { type: "message_stop" });
        // Algunos upstreams mandan su costo en un evento propio, después de `message_stop`.
        if (lateCost) namedEvent(response, { type: "inferhub_usage", usage: { cost } });
        if (!response.destroyed) response.end();
      }

      const prompt = promptTokens(body);
      const contentTokens = chunks * tokensPerChunk;
      const completion = reasoning.length + contentTokens;
      const tokens = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
      const vendorUsage = {
        ...tokens,
        prompt_tokens_details: { cached_tokens: 0, image_tokens: 0, text_tokens: prompt },
        completion_tokens_details: { reasoning_tokens: reasoning.length, text_tokens: contentTokens },
      };
      const cost = usageCost(prompt, completion, input, output);
      const error = { message: "InferHub provider failed", type: "server_error", source: "inferhub" };
      const toolCall = {
        id: "call_7f3a9c2b1d4e6a80", type: "function",
        function: { name: "get_weather", arguments: toolArgumentChunks.join("") },
      };
      if (body.stream !== true) {
        if (scenario === "tool-call") {
          json(response, 200, {
            id, model, created, object: "chat.completion", request_id: requestId, provider: "inferhub",
            choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [toolCall] }, finish_reason: "tool_calls" }],
            usage: { ...vendorUsage, cost },
          });
          return;
        }
        if (scenario === "stream-error-200" || scenario === "mid-stream-error") {
          json(response, 200, { error });
          return;
        }
        if (scenario === "empty-stream") {
          json(response, 200, {});
          return;
        }
        const payload = {
          id, model, created, object: "chat.completion", request_id: requestId, provider: "inferhub",
          choices: [{ index: 0, message: { role: "assistant", content: contentChunk.repeat(chunks), reasoning_content: reasoning.join("") }, finish_reason: "stop" }],
          ...(scenario === "no-usage" ? {} : { usage: { ...vendorUsage, cost } }),
        };
        if (scenario === "cut") {
          const serialized = Buffer.from(JSON.stringify(payload));
          response.writeHead(200, { "content-type": "application/json", "content-length": serialized.length });
          response.write(serialized.subarray(0, Math.floor(serialized.length / 2)));
          // Deja salir el body parcial antes de destruir el socket.
          if (!await pause(response, 0)) return;
          serverAborted = true;
          response.destroy();
          return;
        }
        json(response, 200, payload);
        return;
      }

      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      if (scenario === "empty-stream") {
        response.end("data: [DONE]\n\n");
        return;
      }
      const chunkBase = { id, model, created, object: "chat.completion.chunk" };
      if (scenario === "tool-call") {
        const toolDelta = (value: Record<string, unknown>, finishReason: string | null = null) => ({
          ...chunkBase,
          choices: [{ index: 0, delta: value, finish_reason: finishReason, logprobs: null }],
          usage: null,
        });
        response.write(": INFERHUB PROCESSING\n\n");
        event(response, toolDelta({ role: "assistant", content: null }));
        event(response, toolDelta({ tool_calls: [{ ...toolCall, index: 0, function: { name: toolCall.function.name, arguments: "" } }] }));
        // Fragmentar los argumentos obliga al cliente a acumular por índice.
        for (const argumentsChunk of toolArgumentChunks) {
          event(response, toolDelta({ tool_calls: [{ index: 0, function: { arguments: argumentsChunk } }] }));
          if (!await pause(response, chunkDelayMs)) return;
        }
        event(response, toolDelta({}, "tool_calls"));
        event(response, { ...chunkBase, choices: [], usage: vendorUsage });
        event(response, {
          choices: [], object: "chat.completion.chunk",
          usage: { ...tokens, completion_tokens_details: { reasoning_tokens: reasoning.length }, cost },
        });
        if (!response.destroyed) response.end("data: [DONE]\n\n");
        return;
      }
      const delta = (value: Record<string, string>, finishReason: string | null = null) => ({
        ...chunkBase,
        choices: [{ index: 0, delta: value, finish_reason: finishReason, logprobs: null }],
        ...(scenario === "no-usage" ? {} : { usage: null }),
      });
      const streamError = () => event(response, {
        ...delta({}, "error"),
        error,
      });
      response.write(": INFERHUB PROCESSING\n\n");
      if (scenario === "stream-error-200") {
        streamError();
        response.end("data: [DONE]\n\n");
        return;
      }
      event(response, delta({ role: "assistant", content: "", reasoning_content: "" }));
      const finishesNormally = scenario !== "cut" && scenario !== "mid-stream-error";
      for (const [index, text] of reasoning.entries()) {
        const last = chunks === 0 && index === reasoning.length - 1 && finishesNormally;
        event(response, delta({ reasoning_content: text }, last ? "stop" : null));
      }
      for (let index = 0; index < chunks; index++) {
        if (response.destroyed) return;
        const last = index === chunks - 1 && finishesNormally;
        event(response, delta({ content: contentChunk }, last ? "stop" : null));
        if (!await pause(response, index < chunks - 1 ? chunkDelayMs : 0)) return;
      }
      if (scenario === "cut") {
        serverAborted = true;
        response.destroy();
        return;
      }
      if (scenario === "mid-stream-error") {
        streamError();
      } else {
        if (scenario !== "no-usage") {
          event(response, { ...chunkBase, choices: [], usage: vendorUsage });
          event(response, {
            choices: [], object: "chat.completion.chunk",
            usage: { ...tokens, completion_tokens_details: { reasoning_tokens: reasoning.length }, cost },
          });
        }
      }
      if (!response.destroyed) response.end("data: [DONE]\n\n");
    };
    void respond().catch(() => {
      serverAborted = true;
      if (!response.destroyed && !response.headersSent) json(response, 500, { error: { message: "Mock request failed", source: "inferhub" } });
      else response.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock did not bind a TCP port");
  let closing: Promise<void> | undefined;
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        stopping = true;
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      return closing;
    },
  };
}
