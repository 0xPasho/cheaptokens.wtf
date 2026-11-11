// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  chargeForTokens,
  computeRequestCosts,
  costForTokens,
  createUsageAccumulator,
  estimateTokens,
  MIN_CHARGE_MICRO_USD,
  usdToMicroUsdCeil,
} from "@/lib/gateway/metering";
import type { GatewayModel, UpstreamTarget, Usage } from "@/lib/gateway/types";

function readFixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/inferhub/${name}`, import.meta.url), "utf8");
}

describe("usdToMicroUsdCeil", () => {
  it.each<[number | string, string]>([
    [0.00061484904, "615"],
    [0.00001, "10"],
    [0, "0"],
    [-0, "0"],
    [1e-7, "1"],
    [1e-30, "1"],
    [1e21, "1000000000000000000000000000"],
    ["0.00061484904", "615"],
    ["0.00001000000000000000000000001", "11"],
    ["0.00000999999999999999999999999", "10"],
    ["1e-5", "10"],
    ["6.1484904E-4", "615"],
    ["1e+30", `1${"0".repeat(36)}`],
    ["1e-30", "1"],
    ["0e30", "0"],
    ["0e-30", "0"],
    ["1".padStart(64, "0"), "1000000"],
    ["9007199254740993.0000001", "9007199254740993000001"],
    ["1.234567e+2", "123456700"],
    ["  +.00001  ", "10"],
    ["1.", "1000000"],
  ])("convierte %s USD a %s µUSD sin redondeo flotante", (value, expected) => {
    expect(usdToMicroUsdCeil(value)).toBe(BigInt(expected));
  });

  it.each([
    -1, -1e-7, NaN, Infinity, -Infinity,
    "-0.000001", "-1e-1000000", "NaN", "Infinity", "", " ", "1e", "0x10", "1,2", "1.2.3", "--1",
  ])("rechaza el monto inválido %s", (value) => {
    expect(() => usdToMicroUsdCeil(value)).toThrow(RangeError);
  });

  it.each([
    "1".repeat(65), "1".padStart(65, " "),
    "1e31", "1e-31", "0e31", "0e-31", "1e100000000", "1e-100000000",
    "0e999999999999999999999", 1e31, 5e-324,
  ])("rechaza entradas fuera de los límites: %s", (value) => {
    expect(() => usdToMicroUsdCeil(value)).toThrow(RangeError);
  });
});

describe("costForTokens y chargeForTokens", () => {
  const prices = { input: BigInt(300_000), output: BigInt(1_500_000) };
  const cheapPrices = { input: BigInt(22_500), output: BigInt(22_500) };

  it("calcula el ejemplo de docs/06", () => {
    const tokens = { promptTokens: 2_000, completionTokens: 500 };
    expect(costForTokens(tokens, prices)).toBe(BigInt(1_350));
    expect(chargeForTokens(tokens, prices)).toBe(BigInt(1_350));
  });

  it("redondea una sola vez después de sumar input y output", () => {
    expect(costForTokens({ promptTokens: 1, completionTokens: 1 }, {
      input: BigInt(400_000), output: BigInt(400_000),
    })).toBe(BigInt(1));
    expect(costForTokens({ promptTokens: 1, completionTokens: 1 }, {
      input: BigInt(500_000), output: BigInt(500_000),
    })).toBe(BigInt(1));
  });

  it("cobra cero con cero tokens, sin aplicar el mínimo", () => {
    const tokens = { promptTokens: 0, completionTokens: 0 };
    expect(costForTokens(tokens, prices)).toBe(BigInt(0));
    expect(chargeForTokens(tokens, prices)).toBe(BigInt(0));
  });

  it("no aplica el mínimo cuando no hubo salida", () => {
    expect(chargeForTokens({ promptTokens: 20, completionTokens: 0 }, cheapPrices)).toBe(BigInt(1));
  });

  it("cobra 10 µUSD por 20 tokens a $0.0225/1M cuando hubo salida", () => {
    const tokens = { promptTokens: 19, completionTokens: 1 };
    expect(MIN_CHARGE_MICRO_USD).toBe(BigInt(10));
    expect(costForTokens(tokens, cheapPrices)).toBe(BigInt(1));
    expect(chargeForTokens(tokens, cheapPrices)).toBe(BigInt(10));
  });

  it("permite configurar o desactivar el mínimo", () => {
    const tokens = { promptTokens: 19, completionTokens: 1 };
    expect(chargeForTokens(tokens, cheapPrices, BigInt(25))).toBe(BigInt(25));
    expect(chargeForTokens(tokens, cheapPrices, BigInt(0))).toBe(BigInt(1));
  });

  it("mantiene exactitud con 10^12 tokens y precios mayores al entero seguro", () => {
    expect(costForTokens({ promptTokens: 1_000_000_000_000, completionTokens: 1_000_000_000_000 }, {
      input: BigInt("9007199254740993"), output: BigInt("9007199254740995"),
    })).toBe(BigInt("18014398509481988000000"));
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rechaza tokens inválidos: %s", (value) => {
    expect(() => costForTokens({ promptTokens: value, completionTokens: 0 }, prices)).toThrow(RangeError);
    expect(() => costForTokens({ promptTokens: 0, completionTokens: value }, prices)).toThrow(RangeError);
  });

  it("rechaza precios o mínimos negativos", () => {
    const tokens = { promptTokens: 1, completionTokens: 1 };
    expect(() => costForTokens(tokens, { ...prices, input: BigInt(-1) })).toThrow(RangeError);
    expect(() => costForTokens(tokens, { ...prices, output: BigInt(-1) })).toThrow(RangeError);
    expect(() => chargeForTokens(tokens, prices, BigInt(-1))).toThrow(RangeError);
  });
});

describe("estimateTokens", () => {
  it.each([[0, 0], [1, 1], [4, 1], [5, 2], [80, 20], [1_000_000_000_001, 250_000_000_001]])(
    "estima %s caracteres en %s tokens", (chars, tokens) => {
      expect(estimateTokens(chars)).toBe(tokens);
    },
  );

  it.each([NaN, Infinity, -Infinity, -1, -0.5])("rechaza caracteres inválidos: %s", (chars) => {
    expect(() => estimateTokens(chars)).toThrow(RangeError);
  });
});

describe("createUsageAccumulator", () => {
  it.each([
    ["chat-stream-double-usage.sse", 36, 28, 24],
    ["chat-stream-without-stream-options.sse", 63, 40, 28],
  ] as const)("combina los dos usage reales de %s sin sumarlos", (fixture, promptTokens, completionTokens, reasoningTokens) => {
    const accumulator = createUsageAccumulator();
    let usageChunks = 0;
    for (const line of readFixture(fixture).split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      const payload: unknown = JSON.parse(data);
      if (typeof payload === "object" && payload !== null && "usage" in payload && payload.usage) usageChunks++;
      accumulator.observe(payload);
    }

    expect(usageChunks).toBe(2);
    expect(accumulator.result()).toEqual({
      promptTokens, completionTokens, cachedTokens: 0, reasoningTokens,
      upstreamCostMicroUsd: BigInt(10), estimated: false,
    });
  });

  it.each([
    ["chat-reasoning-length.json", 36, 20, 0, 20],
    ["chat-estimated-usage.json", 5, 1, null, null],
  ] as const)("lee %s y confía en los tokens reportados", (fixture, promptTokens, completionTokens, cachedTokens, reasoningTokens) => {
    const accumulator = createUsageAccumulator();
    accumulator.observe(JSON.parse(readFixture(fixture)));
    expect(accumulator.result()).toEqual({
      promptTokens, completionTokens, cachedTokens, reasoningTokens,
      upstreamCostMicroUsd: BigInt(10), estimated: false,
    });
  });

  it("devuelve null si no llegó ningún objeto usage", () => {
    const accumulator = createUsageAccumulator();
    expect(accumulator.result()).toBeNull();
    expect(accumulator.upstreamCost()).toBeNull();
    for (const payload of [undefined, null, true, 12, "garbage", [], {}, { usage: null }, { usage: [] }, { usage: "bad" }]) {
      expect(() => accumulator.observe(payload)).not.toThrow();
    }
    expect(accumulator.result()).toBeNull();
  });

  it("conserva el costo sin tokens para usarlo cuando el handler estima", () => {
    const accumulator = createUsageAccumulator();
    accumulator.observe({ usage: { cost: "1e-5" } });
    expect(accumulator.result()).toBeNull();
    expect(accumulator.upstreamCost()).toBe(BigInt(10));
    accumulator.observe({ usage: {} });
    accumulator.observe({ usage: { cost: "1e100000000" } });
    expect(accumulator.result()).toBeNull();
    expect(accumulator.upstreamCost()).toBe(BigInt(10));
    accumulator.observe({ usage: { cost: "0" } });
    expect(accumulator.result()).toBeNull();
    expect(accumulator.upstreamCost()).toBe(BigInt(0));
    accumulator.observe({ usage: { prompt_tokens: 4 } });
    expect(accumulator.result()).toEqual({
      promptTokens: 4, completionTokens: 0, cachedTokens: null, reasoningTokens: null,
      upstreamCostMicroUsd: BigInt(0), estimated: false,
    });
  });

  it.each([
    {}, { prompt_tokens: -1, completion_tokens: "2" },
    { prompt_tokens: NaN, completion_tokens: Infinity },
    { prompt_tokens: 0.5, completion_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { prompt_tokens_details: { cached_tokens: 2 }, completion_tokens_details: { reasoning_tokens: 3 } },
  ])("devuelve null si usage no trae tokens válidos: %j", (incoming) => {
    const accumulator = createUsageAccumulator();
    accumulator.observe({ usage: incoming });
    expect(accumulator.result()).toBeNull();
    expect(accumulator.upstreamCost()).toBeNull();
  });

  it.each([
    [{ prompt_tokens: 4 }, 4, 0],
    [{ completion_tokens: 2 }, 0, 2],
    [{ prompt_tokens: 0 }, 0, 0],
    [{ completion_tokens: 0 }, 0, 0],
  ])("acepta un solo contador válido y usa cero para el ausente: %j", (incoming, promptTokens, completionTokens) => {
    const accumulator = createUsageAccumulator();
    accumulator.observe({ usage: incoming });
    expect(accumulator.result()).toEqual({
      promptTokens, completionTokens, cachedTokens: null, reasoningTokens: null,
      upstreamCostMicroUsd: null, estimated: false,
    });
  });

  it("usa el último valor válido de cada campo, también ceros y costo string", () => {
    const accumulator = createUsageAccumulator();
    accumulator.observe({ usage: {
      prompt_tokens: 100, completion_tokens: 30, cost: 0.001,
      prompt_tokens_details: { cached_tokens: 40 }, completion_tokens_details: { reasoning_tokens: 10 },
    } });
    accumulator.observe({ usage: { prompt_tokens: 200, cost: "0.00061484904" } });
    accumulator.observe({ usage: { completion_tokens: 20, prompt_tokens_details: { cached_tokens: 0 } } });
    expect(accumulator.result()).toEqual({
      promptTokens: 200, completionTokens: 20, cachedTokens: 0, reasoningTokens: 10,
      upstreamCostMicroUsd: BigInt(615), estimated: false,
    });
    accumulator.observe({ usage: { prompt_tokens: 0, completion_tokens: 0, cost: "0", completion_tokens_details: { reasoning_tokens: 0 } } });
    expect(accumulator.result()).toEqual({
      promptTokens: 0, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0,
      upstreamCostMicroUsd: BigInt(0), estimated: false,
    });
  });

  it("ignora campos inválidos y costos malformados sin perder lo medido", () => {
    const accumulator = createUsageAccumulator();
    accumulator.observe({ usage: {
      prompt_tokens: 4, completion_tokens: 2, cost: "0.00001",
      prompt_tokens_details: { cached_tokens: 1 }, completion_tokens_details: { reasoning_tokens: 1 },
    } });
    const expected = accumulator.result();
    for (const cost of [-1, NaN, Infinity, "bad", "-0.01", null, {}, []]) {
      expect(() => accumulator.observe({ usage: {
        prompt_tokens: "10", completion_tokens: -2, cost,
        prompt_tokens_details: { cached_tokens: 0.5 }, completion_tokens_details: { reasoning_tokens: Infinity },
      } })).not.toThrow();
      expect(accumulator.result()).toEqual(expected);
    }
  });

  it("nunca lanza aun con getters o proxies que fallan", () => {
    const accumulator = createUsageAccumulator();
    const payload = new Proxy({}, { get() { throw new Error("Unreadable payload"); } });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => accumulator.observe(payload)).not.toThrow();
    expect(() => accumulator.observe(revoked.proxy)).not.toThrow();
    expect(accumulator.result()).toBeNull();
  });

  it("devuelve una copia para proteger la medición de mutaciones externas", () => {
    const accumulator = createUsageAccumulator();
    accumulator.observe({ usage: { prompt_tokens: 4 } });
    const result = accumulator.result();
    if (result) result.promptTokens = 999;
    expect(accumulator.result()?.promptTokens).toBe(4);
  });
});

const target: UpstreamTarget = {
  upstreamId: "mock", baseUrl: "http://127.0.0.1", apiKey: "", upstreamModel: "acme/model",
  costInputPer1M: BigInt(300_000), costOutputPer1M: BigInt(1_500_000), priority: 0, sendsPriceCap: false,
};
const model: GatewayModel = {
  id: "acme/model", status: "active", isReasoning: true,
  inputPricePer1M: BigInt(600_000), outputPricePer1M: BigInt(3_000_000),
  officialInputPer1M: BigInt(3_000_000), officialOutputPer1M: BigInt(15_000_000), upstreams: [target],
};
const usage: Usage = {
  promptTokens: 2_000, completionTokens: 500, cachedTokens: 1_000, reasoningTokens: 250,
  upstreamCostMicroUsd: null, estimated: false,
};

describe("computeRequestCosts", () => {
  it("calcula los tres costos sin volver a sumar razonamiento ni restar caché", () => {
    expect(computeRequestCosts({ usage, model, target })).toEqual({
      costMicroUsd: BigInt(2_700), upstreamCostMicroUsd: BigInt(1_350), officialCostMicroUsd: BigInt(13_500),
    });
  });

  it.each([BigInt(615), BigInt(0)])("prefiere el costo reportado %s, incluso sin target", (upstreamCostMicroUsd) => {
    for (const selectedTarget of [target, null]) {
      expect(computeRequestCosts({ usage: { ...usage, upstreamCostMicroUsd }, model, target: selectedTarget }))
        .toEqual({ costMicroUsd: BigInt(2_700), upstreamCostMicroUsd, officialCostMicroUsd: BigInt(13_500) });
    }
  });

  it("usa cero para el upstream si no hay costo reportado ni target", () => {
    expect(computeRequestCosts({ usage, model, target: null }).upstreamCostMicroUsd).toBe(BigInt(0));
  });

  it("aplica el mínimo solo al cliente, conservando el ahorro negativo", () => {
    const smallUsage = { ...usage, promptTokens: 1, completionTokens: 1 };
    expect(computeRequestCosts({ usage: smallUsage, model, target })).toEqual({
      costMicroUsd: BigInt(10), upstreamCostMicroUsd: BigInt(2), officialCostMicroUsd: BigInt(18),
    });
    expect(computeRequestCosts({ usage: smallUsage, model: {
      ...model, officialInputPer1M: BigInt(150_000), officialOutputPer1M: BigInt(150_000),
    }, target }).officialCostMicroUsd).toBe(BigInt(1));
  });

  it("cobra sin mínimo cuando no hubo salida y permite usage estimado", () => {
    expect(computeRequestCosts({ usage: {
      ...usage, promptTokens: 1, completionTokens: 0, estimated: true,
    }, model, target })).toEqual({
      costMicroUsd: BigInt(1), upstreamCostMicroUsd: BigInt(1), officialCostMicroUsd: BigInt(3),
    });
  });
});
