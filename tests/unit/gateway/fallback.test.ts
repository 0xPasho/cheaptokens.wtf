// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccountRotation } from "@/lib/gateway/accounts";
import { ACCOUNT_PAUSE_MS, callUpstream } from "@/lib/gateway/select-upstream";
import type { CallUpstreamOptions, GatewayModel, SseEvent, UpstreamResult, UpstreamTarget } from "@/lib/gateway/types";

import { startMockUpstream } from "../../helpers/mock-upstream";

let mock: Awaited<ReturnType<typeof startMockUpstream>>;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function options(scenarios: string[], stream = false, apiKeys: readonly string[] = ["secret-key"]): CallUpstreamOptions {
  const model: GatewayModel = {
    id: "public/model", status: "active", isReasoning: false,
    inputPricePer1M: BigInt(20_000), outputPricePer1M: BigInt(40_000),
    officialInputPer1M: BigInt(100_000), officialOutputPer1M: BigInt(200_000),
    contextLength: 128_000, maxOutputTokens: null,
    upstreams: scenarios.map((scenario, index) => ({
      upstreamId: `upstream-${index}`, baseUrl: mock.baseUrl, apiKeys,
      upstreamModel: `mock/${scenario}`, priority: index,
      costInputPer1M: BigInt(17_550), costOutputPer1M: BigInt(199_000), sendsPriceCap: true,
    })),
  };
  return {
    model, body: { model: model.id, messages: [{ role: "user", content: "private prompt" }], stream },
    stream, fetch, now: Date.now, log,
  };
}

async function drain(result: UpstreamResult): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  if (result.ok && result.stream) for await (const event of result.events) events.push(event);
  return events;
}

beforeAll(async () => { mock = await startMockUpstream(); });
afterAll(async () => { await mock.close(); });
beforeEach(() => { mock.requests.length = 0; vi.clearAllMocks(); });

describe.each([false, true])("fallback (stream=%s)", (stream) => {
  it.each([
    ["error-401", 401, "warning"], ["error-403", 403, "warning"], ["error-404", 404, "warning"],
    ["error-402", 402, "critical"], ["error-402-bid", 402, null],
    ["error-429", 429, null], ["error-500", 500, null], ["error-503", 503, null],
    ["error-599", 599, null], ["reset", null, null],
  ])("%s intenta el siguiente upstream", async (scenario, status, severity) => {
    const result = await callUpstream(options([scenario, "ok"], stream));
    expect(result).toMatchObject({ ok: true, stream, attempts: 2, target: { upstreamId: "upstream-1" } });
    expect(mock.requests.map((request) => request.body)).toEqual([
      expect.objectContaining({ model: `mock/${scenario}` }), expect.objectContaining({ model: "mock/ok" }),
    ]);
    if (severity) {
      expect(log.error).toHaveBeenCalledExactlyOnceWith("upstream_alert", expect.objectContaining({
        upstreamId: "upstream-0", attempt: 1, status, severity,
        kind: "http",
      }));
      expect(log.warn).not.toHaveBeenCalled();
    } else {
      expect(log.error).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledExactlyOnceWith("upstream_failure", expect.objectContaining({
        upstreamId: "upstream-0", attempt: 1,
        kind: status === null ? "network" : "http",
        ...(status === null ? {} : { status }),
        ...(scenario === "error-402-bid" ? { code: "no_provider_under_bid" } : {}),
      }));
    }
    await drain(result);
  });

  it.each([400, 422])("%s termina sin fallback y con mensaje saneado", async (status) => {
    const result = await callUpstream(options([`error-${status}`, "ok"], stream));
    expect(result).toMatchObject({
      ok: false, attempts: 1, errorCode: "invalid_request",
      failure: { kind: "http", status }, clientMessage: expect.any(String),
    });
    if (result.ok) throw new Error("Expected failure");
    expect(result.clientMessage).not.toMatch(/inferhub|qwen|alibaba|request_id/i);
    expect(mock.requests).toHaveLength(1);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("limita los intentos a tres y conserva el último fallo", async () => {
    const result = await callUpstream(options(["error-500", "error-429", "error-503", "ok"], stream));
    expect(result).toMatchObject({
      ok: false, attempts: 3, errorCode: "upstream_error", target: { upstreamId: "upstream-2" },
      failure: { kind: "http", status: 503 }, clientMessage: null,
    });
    expect(mock.requests).toHaveLength(3);
  });

  it("respeta maxAttempts y el orden recibido aunque las prioridades difieran", async () => {
    const input = options(["error-500", "ok"], stream);
    input.model.upstreams[0].priority = 100;
    const result = await callUpstream({ ...input, maxAttempts: 1 });
    expect(result).toMatchObject({ ok: false, attempts: 1, target: { upstreamId: "upstream-0" } });
    expect(mock.requests).toHaveLength(1);
  });

  it.each([0, -1, -5])("maxAttempts=%s permite al menos un intento", async (maxAttempts) => {
    const result = await callUpstream({ ...options(["error-500", "ok", "ok"], stream), maxAttempts });
    expect(result).toMatchObject({ ok: false, attempts: 1, failure: { kind: "http", status: 500 } });
    expect(mock.requests).toHaveLength(1);
  });

  it("sin upstreams devuelve no_upstream_available", async () => {
    expect(await callUpstream(options([], stream))).toEqual({
      ok: false, attempts: 0, target: null, failure: null, errorCode: "no_upstream_available", clientMessage: null,
    });
    expect(mock.requests).toHaveLength(0);
  });

  it("un timeout hace fallback y ttfbMs incluye el intento fallido", async () => {
    const input = options(["slow-first-byte:600", "ok"], stream);
    const result = await callUpstream({
      ...input, timeouts: { connectMs: 1000, firstByteMs: 150 },
    });
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(log.warn).toHaveBeenCalledWith("upstream_failure", expect.objectContaining({ kind: "timeout", phase: "first_byte" }));
    if (!result.ok) throw new Error("Expected success");
    expect(result.ttfbMs).toBeGreaterThanOrEqual(140);
    await drain(result);
  });

  it("todos los intentos vencidos devuelven upstream_timeout", async () => {
    const result = await callUpstream({
      ...options(["hang", "hang"], stream), timeouts: { connectMs: 100, firstByteMs: 150 },
    });
    expect(result).toMatchObject({
      ok: false, attempts: 2, errorCode: "upstream_timeout",
      failure: { kind: "timeout", phase: stream ? "connect" : "first_byte" },
    });
    expect(mock.requests).toHaveLength(2);
  });

  it("un fallo HTTP seguido de timeout devuelve upstream_error", async () => {
    const result = await callUpstream({
      ...options(["error-500", "hang"], stream), timeouts: { connectMs: 100, firstByteMs: 150 },
    });
    expect(result).toMatchObject({ ok: false, attempts: 2, errorCode: "upstream_error", failure: { kind: "timeout" } });
  });

  it("maxDuration aborta el intento y evita el fallback", async () => {
    const controller = new AbortController();
    const reason = new Error("Maximum duration exceeded");
    const timer = setTimeout(() => controller.abort(reason), 100);
    try {
      await expect(callUpstream({ ...options(["hang", "ok"], stream), signal: controller.signal })).rejects.toBe(reason);
      expect(mock.requests).toHaveLength(1);
      expect(log.warn).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timer);
    }
  });
});

describe("sin stream", () => {
  it.each(["stream-error-200", "empty-stream", "mid-stream-error"])("%s permite fallback con HTTP 200 inválido", async (scenario) => {
    const result = await callUpstream(options([scenario, "ok"]));
    expect(result).toMatchObject({
      ok: true, stream: false, attempts: 2, target: { upstreamId: "upstream-1" },
      body: { choices: expect.any(Array) },
    });
    expect(mock.requests).toHaveLength(2);
    expect(log.warn).toHaveBeenCalledExactlyOnceWith("upstream_failure", expect.objectContaining({ kind: "stream_error" }));
  });

  it.each(["stream-error-200", "empty-stream", "mid-stream-error"])("%s sin alternativa devuelve upstream_error", async (scenario) => {
    expect(await callUpstream(options([scenario]))).toMatchObject({
      ok: false, attempts: 1, errorCode: "upstream_error", failure: { kind: "stream_error" }, clientMessage: null,
    });
    expect(mock.requests).toHaveLength(1);
  });
});

describe("stream", () => {
  it.each(["stream-error-200", "empty-stream"])("%s permite fallback antes del primer dato", async (scenario) => {
    const result = await callUpstream(options([scenario, "ok"], true));
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    const events = await drain(result);
    expect(events[0]).toMatchObject({ type: "data" });
    expect(events.at(-1)).toEqual({ type: "data", data: "[DONE]" });
  });

  it("un error inicial sin alternativa devuelve stream_error", async () => {
    expect(await callUpstream(options(["stream-error-200"], true))).toMatchObject({
      ok: false, attempts: 1, errorCode: "upstream_error", failure: { kind: "stream_error" },
    });
  });

  it("mid-stream-error conserva ok sin intentar otro upstream", async () => {
    const result = await callUpstream(options(["mid-stream-error", "ok"], true));
    expect(result).toMatchObject({ ok: true, attempts: 1 });
    const events = await drain(result);
    expect(events[0].type).toBe("data");
    expect(events.some((event) => event.type === "data" && event.data.includes('"error":'))).toBe(true);
    expect(mock.requests).toHaveLength(1);
  });

  it("maxDuration sigue abortando después del primer dato", async () => {
    const controller = new AbortController();
    const input = options(["ok", "ok"], true);
    const result = await callUpstream({
      ...input, body: { ...input.body, x_mock: { chunks: 10, chunkDelayMs: 100 } }, signal: controller.signal,
    });
    expect(result.ok).toBe(true);
    controller.abort(new Error("Maximum duration exceeded"));
    await expect(drain(result)).rejects.toThrow("Maximum duration exceeded");
    expect(mock.requests).toHaveLength(1);
  });
});

it("no inicia fetch si el aborto global ya ocurrió", async () => {
  const signal = AbortSignal.abort(new Error("Expired"));
  await expect(callUpstream({ ...options(["ok"]), signal })).rejects.toThrow("Expired");
  expect(mock.requests).toHaveLength(0);
});

it("logs solo contienen los campos operativos permitidos", async () => {
  await callUpstream(options(["error-402", "error-401", "error-429"]));
  const allowed = new Set(["upstreamId", "account", "attempt", "kind", "status", "code", "phase", "durationMs", "severity"]);
  for (const [, fields] of [...log.error.mock.calls, ...log.warn.mock.calls]) {
    expect(Object.keys(fields).every((key) => allowed.has(key))).toBe(true);
  }
  expect(JSON.stringify([...log.error.mock.calls, ...log.warn.mock.calls])).not.toMatch(/secret-key|private prompt|source|message|baseUrl/);
});

it.each([401, 429])("trunca code a 64 caracteres en el log de HTTP %s", async (status) => {
  const code = "x".repeat(1000);
  const result = await callUpstream({
    ...options(["ok"]), fetch: async () => Response.json({ error: { code } }, { status }),
  });
  expect(result).toMatchObject({ ok: false, failure: { kind: "http", code } });
  const logger = status === 401 ? log.error : log.warn;
  expect(logger).toHaveBeenCalledExactlyOnceWith(status === 401 ? "upstream_alert" : "upstream_failure", expect.objectContaining({
    kind: "http", status, code: "x".repeat(64),
  }));
});

describe("varias cuentas por upstream", () => {
  const keys = ["key-a", "key-b", "key-c"];
  let used: string[];

  /** Anota la key de cada intento. Las de `failures` responden ese status; las demás llegan al mock. */
  function byAccount(failures: Record<string, { status: number; code?: string }> = {}): typeof fetch {
    return async (input, init) => {
      const key = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
      used.push(key);
      const failure = failures[key];
      if (!failure) return fetch(input, init);
      return Response.json({ error: { message: "Account failure", code: failure.code ?? null } }, { status: failure.status });
    };
  }

  beforeEach(() => { used = []; });

  it("cada request empieza en la cuenta siguiente y vuelve a la primera", async () => {
    const accounts = createAccountRotation({ random: () => 0 });
    for (let request = 0; request < 4; request++) {
      expect(await callUpstream({ ...options(["ok"], false, keys), fetch: byAccount(), accounts })).toMatchObject({ ok: true, attempts: 1 });
    }
    expect(used).toEqual(["key-a", "key-b", "key-c", "key-a"]);
  });

  it("cada instancia arranca en una cuenta al azar", async () => {
    const accounts = createAccountRotation({ random: () => 0.7 });
    await callUpstream({ ...options(["ok"], false, keys), fetch: byAccount(), accounts });
    expect(used).toEqual(["key-c"]);
  });

  it.each([
    [{ status: 401 }, "upstream_alert", ACCOUNT_PAUSE_MS.rejected],
    [{ status: 403 }, "upstream_alert", ACCOUNT_PAUSE_MS.rejected],
    [{ status: 402, code: "insufficient_balance" }, "upstream_alert", ACCOUNT_PAUSE_MS.rejected],
    [{ status: 429 }, "upstream_failure", ACCOUNT_PAUSE_MS.rateLimited],
  ])("%o en una cuenta prueba la siguiente del mismo upstream y la pausa", async (failure, event, pauseMs) => {
    let now = 0;
    const accounts = createAccountRotation({ random: () => 0, now: () => now });
    const input = { ...options(["ok", "ok"], false, keys.slice(0, 2)), fetch: byAccount({ "key-a": failure }), accounts };
    expect(await callUpstream(input)).toMatchObject({ ok: true, attempts: 2, target: { upstreamId: "upstream-0" } });
    expect(used).toEqual(["key-a", "key-b"]);
    const logger = event === "upstream_alert" ? log.error : log.warn;
    expect(logger).toHaveBeenCalledExactlyOnceWith(event, expect.objectContaining({
      upstreamId: "upstream-0", account: 1, attempt: 1, status: failure.status,
    }));

    // Le toca a key-b y después a key-a, pero key-a está pausada: va al final.
    used = [];
    await callUpstream(input);
    await callUpstream(input);
    expect(used).toEqual(["key-b", "key-b"]);

    // Al vencer la pausa vuelve a su turno.
    now = pauseMs;
    used = [];
    await callUpstream(input);
    await callUpstream(input);
    expect(used).toEqual(["key-b", "key-a", "key-b"]);
  });

  it.each(["error-500", "error-503", "error-404", "error-402-bid", "reset"])(
    "%s es del upstream: pasa al siguiente sin probar otra cuenta",
    async (scenario) => {
      const accounts = createAccountRotation({ random: () => 0 });
      const input = options([scenario, "ok"], false, keys);
      input.model.upstreams[1].apiKeys = ["other-key"];
      const result = await callUpstream({ ...input, fetch: byAccount(), accounts });
      expect(result).toMatchObject({ ok: true, attempts: 2, target: { upstreamId: "upstream-1" } });
      expect(used).toEqual(["key-a", "other-key"]);
      expect(mock.requests.map((request) => request.body)).toEqual([
        expect.objectContaining({ model: `mock/${scenario}` }), expect.objectContaining({ model: "mock/ok" }),
      ]);
    },
  );

  it("el tope de tres intentos cuenta también los cambios de cuenta", async () => {
    const accounts = createAccountRotation({ random: () => 0 });
    const limited = { status: 429 };
    const result = await callUpstream({
      ...options(["ok", "ok"], false, [...keys, "key-d"]),
      fetch: byAccount({ "key-a": limited, "key-b": limited, "key-c": limited, "key-d": limited }), accounts,
    });
    expect(result).toMatchObject({ ok: false, attempts: 3, errorCode: "upstream_error", target: { upstreamId: "upstream-0" } });
    expect(used).toEqual(["key-a", "key-b", "key-c"]);
  });

  it("con todas las cuentas agotadas pasa al siguiente upstream", async () => {
    const accounts = createAccountRotation({ random: () => 0 });
    const input = options(["ok", "ok"], false, keys.slice(0, 2));
    input.model.upstreams[1].apiKeys = ["other-key"];
    const result = await callUpstream({
      ...input, fetch: byAccount({ "key-a": { status: 429 }, "key-b": { status: 401 } }), accounts,
    });
    expect(result).toMatchObject({ ok: true, attempts: 3, target: { upstreamId: "upstream-1" } });
    expect(used).toEqual(["key-a", "key-b", "other-key"]);
  });

  it("si todas están pausadas las sigue probando, primero la que se libera antes", async () => {
    const accounts = createAccountRotation({ random: () => 0, now: () => 0 });
    accounts.pause("upstream-0", 0, ACCOUNT_PAUSE_MS.rejected);
    accounts.pause("upstream-0", 1, ACCOUNT_PAUSE_MS.rateLimited);
    const result = await callUpstream({ ...options(["ok"], false, keys.slice(0, 2)), fetch: byAccount(), accounts });
    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(used).toEqual(["key-b"]);
  });

  it("sin rotación prueba las cuentas en el orden escrito", async () => {
    const input = { ...options(["ok"], false, keys), fetch: byAccount({ "key-a": { status: 429 } }) };
    await callUpstream(input);
    await callUpstream(input);
    expect(used).toEqual(["key-a", "key-b", "key-a", "key-b"]);
  });

  it("avisa cada intento con su upstream", async () => {
    const onAttempt = vi.fn<(target: UpstreamTarget) => void>();
    await callUpstream({
      ...options(["ok", "ok"], false, keys.slice(0, 2)),
      fetch: byAccount({ "key-a": { status: 429 }, "key-b": { status: 429 } }), onAttempt,
    });
    expect(onAttempt.mock.calls.map(([target]) => target.upstreamId))
      .toEqual(["upstream-0", "upstream-0", "upstream-1"]);
  });
});
