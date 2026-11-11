// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchUpstream } from "@/lib/gateway/upstream-fetch";
import type { CallUpstreamOptions, SseEvent, UpstreamTarget } from "@/lib/gateway/types";

import { startMockUpstream } from "../../helpers/mock-upstream";

let mock: Awaited<ReturnType<typeof startMockUpstream>>;

function target(overrides: Partial<UpstreamTarget> = {}): UpstreamTarget {
  return {
    upstreamId: "mock", baseUrl: mock.baseUrl, apiKey: "upstream-secret", upstreamModel: "mock/ok",
    costInputPer1M: BigInt(17_550), costOutputPer1M: BigInt(199_000), priority: 1, sendsPriceCap: true,
    ...overrides,
  };
}

function options(stream = false, overrides: Partial<CallUpstreamOptions> = {}): CallUpstreamOptions {
  return {
    model: {
      id: "public/model", status: "active", isReasoning: false, upstreams: [],
      inputPricePer1M: BigInt(20_000), outputPricePer1M: BigInt(40_000),
      officialInputPer1M: BigInt(100_000), officialOutputPer1M: BigInt(200_000),
    },
    body: { model: "public/model", messages: [{ role: "user", content: "private prompt" }], stream },
    stream, fetch, now: Date.now, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

beforeAll(async () => { mock = await startMockUpstream({ askInputPer1M: 0, askOutputPer1M: 0 }); });
afterAll(async () => { await mock.close(); });
beforeEach(() => { mock.requests.length = 0; });

describe.each([false, true])("request (stream=%s)", (stream) => {
  it("reescribe model, conserva el body y usa solo los headers propios", async () => {
    const body = Object.freeze({
      ...options(stream).body,
      stream_options: Object.freeze({ include_usage: false, extra: "preserved" }),
      tools: [{ type: "function", function: { name: "weather" } }],
    });
    const original = JSON.stringify(body);
    const result = await fetchUpstream(options(stream, { body }), target());
    expect(result).toMatchObject({ ok: true, stream });
    if (result.ok && result.stream) for await (const event of result.events) expect(event).toBeDefined();
    expect(JSON.stringify(body)).toBe(original);
    expect(mock.requests[0]).toMatchObject({
      method: "POST", path: "/v1/chat/completions",
      headers: {
        "content-type": "application/json", authorization: "Bearer upstream-secret",
        "x-max-input-price": "0.01755", "x-max-output-price": "0.199",
      },
      body: {
        ...body, model: "mock/ok", stream_options: { include_usage: stream, extra: "preserved" },
      },
    });
    expect(mock.requests[0].headers).not.toHaveProperty("x-mock-scenario");
    expect(mock.requests[0].headers).not.toHaveProperty("cookie");
  });

  it("omite Authorization con key vacía y los topes cuando no corresponden", async () => {
    const result = await fetchUpstream(options(stream), target({ apiKey: "", sendsPriceCap: false }));
    if (result.ok && result.stream) for await (const event of result.events) expect(event).toBeDefined();
    expect(mock.requests[0].headers).not.toHaveProperty("authorization");
    expect(mock.requests[0].headers).not.toHaveProperty("x-max-input-price");
    expect(mock.requests[0].headers).not.toHaveProperty("x-max-output-price");
  });

  it("hang aborta el fetch con la fase correspondiente", async () => {
    const result = await fetchUpstream(options(stream, { timeouts: { connectMs: 100, firstByteMs: 180 } }), target({ upstreamModel: "mock/hang" }));
    expect(result).toEqual({ ok: false, failure: { kind: "timeout", phase: stream ? "connect" : "first_byte" }, clientMessage: null });
  });

  it("reasoning usa su timeout largo configurable", async () => {
    const input = options(stream);
    const result = await fetchUpstream({
      ...input, model: { ...input.model, isReasoning: true },
      timeouts: { connectMs: 1000, firstByteMs: 50, firstByteReasoningMs: 600 },
    }, target({ upstreamModel: "mock/slow-first-byte:180" }));
    expect(result).toMatchObject({ ok: true, stream });
    if (result.ok && result.stream) for await (const event of result.events) expect(event).toBeDefined();
  });
});

it.each([
  [BigInt(0), "0"], [BigInt(1), "0.000001"], [BigInt(1_000_000), "1"],
  [BigInt(1_234_500), "1.2345"], [BigInt("9007199254740993123456"), "9007199254740993.123456"],
])("convierte el tope %s sin perder precisión", async (price, expected) => {
  await fetchUpstream(options(), target({ costInputPer1M: price, costOutputPer1M: price }));
  expect(mock.requests[0].headers["x-max-input-price"]).toBe(expected);
  expect(mock.requests[0].headers["x-max-output-price"]).toBe(expected);
});

it("fuerza include_usage cuando no había stream_options", async () => {
  const result = await fetchUpstream(options(true), target());
  if (result.ok && result.stream) for await (const event of result.events) expect(event).toBeDefined();
  expect(mock.requests[0].body).toMatchObject({ stream_options: { include_usage: true } });
});

// Estos transportes aíslan bordes que el mock compartido no expone: headers tempranos y bodies parciales.
function responseFetch(create: (signal: AbortSignal) => Response): typeof fetch {
  return async (_input, init) => {
    if (!init?.signal) throw new Error("Expected abort signal");
    return create(init.signal);
  };
}

function delayedBody(signal: AbortSignal, initial: string, rest: string, delay: number): ReadableStream<Uint8Array> {
  let timer: ReturnType<typeof setTimeout>;
  const encoder = new TextEncoder();
  let abort: () => void;
  const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
  return new ReadableStream({
    start(controller) {
      abort = () => { cleanup(); controller.error(signal.reason); };
      signal.addEventListener("abort", abort, { once: true });
      if (initial) controller.enqueue(encoder.encode(initial));
      timer = setTimeout(() => {
        cleanup();
        controller.enqueue(encoder.encode(rest));
        controller.close();
      }, delay);
    },
    cancel() { cleanup(); },
  });
}

it("recibir headers retira connectMs pero los comentarios no satisfacen firstByteMs", async () => {
  const result = await fetchUpstream(options(true, {
    fetch: responseFetch((signal) => new Response(delayedBody(signal, ": processing\n\n", "data: {}\n\n", 600))),
    timeouts: { connectMs: 50, firstByteMs: 150 },
  }), target());
  expect(result).toEqual({ ok: false, failure: { kind: "timeout", phase: "first_byte" }, clientMessage: null });
});

it("el primer byte sin stream exige el JSON completo", async () => {
  const result = await fetchUpstream(options(false, {
    fetch: responseFetch((signal) => new Response(delayedBody(signal, '{"choices":', "[]}", 600))),
    timeouts: { connectMs: 25, firstByteMs: 150 },
  }), target());
  expect(result).toEqual({ ok: false, failure: { kind: "timeout", phase: "first_byte" }, clientMessage: null });
});

it("conserva el primer dato y los comentarios posteriores, sin timeout después de ese dato", async () => {
  const result = await fetchUpstream(options(true, {
    fetch: responseFetch((signal) => new Response(delayedBody(signal,
      ': before\n\ndata: {"choices":[]}\n\n', ': after\n\ndata: [DONE]\n\n', 150))),
    timeouts: { connectMs: 20, firstByteMs: 50 },
  }), target());
  if (!result.ok || !result.stream) throw new Error("Expected stream");
  const events: SseEvent[] = [];
  for await (const event of result.events) events.push(event);
  expect(events).toEqual([
    { type: "data", data: '{"choices":[]}' }, { type: "comment" }, { type: "data", data: "[DONE]" },
  ]);
});

it.each(["", ": comment\n\n", "data: [DONE]\n\n", 'data: {"error":null}\n\n', "data: invalid\n\n"])(
  "rechaza un stream inicial inválido (%s)", async (body) => {
    expect(await fetchUpstream(options(true, { fetch: responseFetch(() => new Response(body)) }), target())).toMatchObject({
      ok: false, failure: { kind: "stream_error" },
    });
  },
);

it("devolver un iterable sin consumirlo cancela el body y libera el aborto global", async () => {
  const signal = new AbortController().signal;
  const remove = vi.spyOn(signal, "removeEventListener");
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("data: {}\n\n")); }, cancel,
  });
  const result = await fetchUpstream(options(true, { signal, fetch: responseFetch(() => new Response(body)) }), target());
  if (!result.ok || !result.stream) throw new Error("Expected stream");
  await result.events[Symbol.asyncIterator]().return?.();
  expect(cancel).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});

it.each([400, 422, 500])("tolera HTML en errores HTTP %s", async (status) => {
  const result = await fetchUpstream(options(false, { fetch: responseFetch(() => new Response("<html>Error</html>", { status })) }), target());
  expect(result).toMatchObject({ ok: false, failure: { kind: "http", status, code: null } });
  if (result.ok) throw new Error("Expected failure");
  expect(result.clientMessage).toBe(status === 500 ? null : "The model rejected the request parameters.");
});

it("conserva un mensaje de parámetro seguro y extrae error.code", async () => {
  const result = await fetchUpstream(options(false, {
    fetch: responseFetch(() => Response.json({ error: { message: "Invalid temperature", param: "temperature", code: "invalid_value" } }, { status: 400 })),
  }), target());
  expect(result).toEqual({
    ok: false, failure: { kind: "http", status: 400, code: "invalid_value" },
    clientMessage: "Invalid temperature (param: temperature)",
  });
});

it("limita la lectura de errores a 64 KiB y aborta el resto", async () => {
  let reads = 0;
  let requestSignal: AbortSignal | undefined;
  const result = await fetchUpstream(options(false, {
    fetch: responseFetch((signal) => {
      requestSignal = signal;
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) { reads++; controller.enqueue(new Uint8Array(1024).fill(32)); },
      }, { highWaterMark: 0 }), { status: 500 });
    }),
  }), target());
  expect(result).toMatchObject({ ok: false, failure: { kind: "http", status: 500, code: null } });
  expect(reads).toBe(64);
  expect(requestSignal?.aborted).toBe(true);
});

it.each([
  [true, false, 10_000, "connect"],
  [false, false, 60_000, "first_byte"],
  [false, true, 180_000, "first_byte"],
])("timeouts por defecto (stream=%s, reasoning=%s)", async (stream, reasoning, milliseconds, phase) => {
  vi.useFakeTimers();
  try {
    const input = options(stream);
    const settled = vi.fn();
    const request = fetchUpstream({
      ...input, model: { ...input.model, isReasoning: reasoning },
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    }, target()).then((result) => { settled(); return result; });
    await vi.advanceTimersByTimeAsync(milliseconds - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await request).toMatchObject({ ok: false, failure: { kind: "timeout", phase } });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("un corte después del primer dato se propaga al consumidor", async () => {
  const result = await fetchUpstream(options(true), target({ upstreamModel: "mock/cut" }));
  if (!result.ok || !result.stream) throw new Error("Expected stream");
  const events: SseEvent[] = [];
  await expect((async () => {
    for await (const event of result.events) events.push(event);
  })()).rejects.toThrow();
  expect(events[0].type).toBe("data");
});

it("maxDuration interrumpe una lectura pendiente después del primer dato", async () => {
  const controller = new AbortController();
  const reason = new Error("Maximum duration exceeded");
  const result = await fetchUpstream(options(true, {
    signal: controller.signal,
    fetch: responseFetch((signal) => new Response(delayedBody(signal, "data: {}\n\n", "data: [DONE]\n\n", 1000))),
  }), target());
  if (!result.ok || !result.stream) throw new Error("Expected stream");
  const iterator = result.events[Symbol.asyncIterator]();
  await iterator.next();
  const next = iterator.next();
  controller.abort(reason);
  await expect(next).rejects.toBe(reason);
  expect(await iterator.next()).toMatchObject({ done: true });
});
