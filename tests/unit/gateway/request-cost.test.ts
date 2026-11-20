// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_OUTPUT_TOKENS, estimatePromptTokens, holdPrices, IMAGE_PROMPT_TOKENS, MIN_OUTPUT_TOKENS, type RequestShape, sizeHold,
  withOutputLimit,
} from "@/lib/gateway/request-cost";
import type { GatewayModel, UpstreamTarget } from "@/lib/gateway/types";

const big = (n: number) => BigInt(n);
const target = (input: number, output: number): UpstreamTarget => ({
  upstreamId: "upstream", baseUrl: "http://127.0.0.1", apiKeys: [], upstreamModel: "acme/model",
  costInputPer1M: big(input), costOutputPer1M: big(output), priority: 1, sendsPriceCap: true,
});
/** $1 por 1M de entrada y $10 por 1M de salida: 1 y 10 µUSD por token. */
const model: GatewayModel = {
  id: "acme/model", status: "active", isReasoning: false,
  inputPricePer1M: big(1_000_000), outputPricePer1M: big(10_000_000),
  officialInputPer1M: big(2_000_000), officialOutputPer1M: big(20_000_000),
  contextLength: 200_000, maxOutputTokens: null, upstreams: [target(500_000, 5_000_000)],
};
const shape = (overrides: Partial<RequestShape> = {}): RequestShape => ({ promptTokens: 1_000, requestedOutputTokens: null, choices: 1, ...overrides });

describe("estimatePromptTokens", () => {
  it("counts the whole body at three bytes per token, not only message text", () => {
    const body = { model: "m", messages: [{ role: "user", content: "hi" }], tools: [{ type: "function", function: { name: "x".repeat(3_000) } }] };
    const raw = JSON.stringify(body);
    expect(estimatePromptTokens(raw, body, 1_000_000)).toBe(Math.ceil(Buffer.byteLength(raw) / 3));
  });

  it("counts UTF-8 bytes, so CJK text is not underestimated", () => {
    const body = { messages: [{ role: "user", content: "你好".repeat(1_000) }] };
    expect(estimatePromptTokens(JSON.stringify(body), body, 1_000_000)).toBeGreaterThanOrEqual(2_000);
  });

  it("replaces each image's bytes with a fixed allowance", () => {
    const image = `data:image/png;base64,${"A".repeat(3_000_000)}`;
    const body = { messages: [{ role: "user", content: [{ type: "text", text: "what?" }, { type: "image_url", image_url: { url: image } }, { type: "image_url", image_url: "https://example.com/cat.png" }] }] };
    const raw = JSON.stringify(body);
    const textOnly = Math.ceil((Buffer.byteLength(raw) - image.length - "https://example.com/cat.png".length) / 3);
    expect(estimatePromptTokens(raw, body, 1_000_000)).toBe(textOnly + 2 * IMAGE_PROMPT_TOKENS);
  });

  it("never estimates more than the model context", () => {
    const body = { messages: [{ role: "user", content: "x".repeat(900_000) }] };
    expect(estimatePromptTokens(JSON.stringify(body), body, 100_000)).toBe(100_000);
  });
});

describe("holdPrices", () => {
  it("uses the catalog price or any upstream cost cap with the margin, whichever is higher", () => {
    expect(holdPrices(model)).toEqual({ input: big(1_000_000), output: big(10_000_000) });
    const expensive = { ...model, upstreams: [target(500_000, 5_000_000), target(1_000_000, 9_000_000)] };
    expect(holdPrices(expensive)).toEqual({ input: big(1_300_000), output: big(11_700_000) });
  });
});

describe("sizeHold", () => {
  it("reserves the prompt and the default output when the client sets none", () => {
    expect(sizeHold(model, shape(), null)).toEqual({
      ok: true, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS, limitsOutput: true,
      amountMicroUsd: big(1_000 + DEFAULT_MAX_OUTPUT_TOKENS * 10),
    });
  });

  it("keeps a client max_tokens that fits and does not send it again", () => {
    expect(sizeHold(model, shape({ requestedOutputTokens: 2_000 }), big(1_000_000)))
      .toEqual({ ok: true, maxOutputTokens: 2_000, limitsOutput: false, amountMicroUsd: big(21_000) });
  });

  it("caps the output at what the budget covers, never below the minimum", () => {
    const budget = big(1_000 + 5_000 * 10 + 9);
    expect(sizeHold(model, shape({ requestedOutputTokens: 8_000 }), budget))
      .toEqual({ ok: true, maxOutputTokens: 5_000, limitsOutput: true, amountMicroUsd: big(51_000) });
    expect(sizeHold(model, shape(), big(1_000 + MIN_OUTPUT_TOKENS * 10))).toMatchObject({ ok: true, maxOutputTokens: MIN_OUTPUT_TOKENS });
    expect(sizeHold(model, shape(), big(1_000 + MIN_OUTPUT_TOKENS * 10 - 1))).toEqual({ ok: false });
  });

  it("lets a request with a small explicit max_tokens use a small budget", () => {
    expect(sizeHold(model, shape({ requestedOutputTokens: 10 }), big(1_100))).toEqual({ ok: true, maxOutputTokens: 10, limitsOutput: false, amountMicroUsd: big(1_100) });
    expect(sizeHold(model, shape({ requestedOutputTokens: 10 }), big(1_099))).toEqual({ ok: false });
  });

  it("rejects when the prompt alone does not fit, and on any negative budget", () => {
    expect(sizeHold(model, shape({ promptTokens: 150_000 }), big(149_999))).toEqual({ ok: false });
    expect(sizeHold(model, shape({ promptTokens: 0, requestedOutputTokens: 1 }), big(-1))).toEqual({ ok: false });
  });

  it("multiplies the output by n", () => {
    expect(sizeHold(model, shape({ requestedOutputTokens: 4_000, choices: 4 }), null)).toMatchObject({ ok: true, amountMicroUsd: big(161_000) });
    expect(sizeHold(model, shape({ requestedOutputTokens: 4_000, choices: 4 }), big(81_000)))
      .toMatchObject({ ok: true, maxOutputTokens: 2_000, amountMicroUsd: big(81_000) });
    // Una salida pedida por debajo del mínimo no se recorta: o cabe completa o se rechaza.
    expect(sizeHold(model, shape({ requestedOutputTokens: 1_000, choices: 4 }), big(40_999))).toEqual({ ok: false });
  });

  it("bounds the output by the model's known maximum and its context", () => {
    expect(sizeHold({ ...model, maxOutputTokens: 8_192 }, shape(), null)).toMatchObject({ maxOutputTokens: 8_192, limitsOutput: true });
    expect(sizeHold({ ...model, maxOutputTokens: 8_192 }, shape({ requestedOutputTokens: 50_000 }), null)).toMatchObject({ maxOutputTokens: 8_192, limitsOutput: true });
    expect(sizeHold({ ...model, contextLength: 4_000 }, shape({ requestedOutputTokens: 50_000 }), null)).toMatchObject({ maxOutputTokens: 4_000 });
  });

  it("charges at least the minimum charge", () => {
    const free = { ...model, inputPricePer1M: big(0), outputPricePer1M: big(0), upstreams: [] };
    expect(sizeHold(free, shape(), big(0))).toEqual({ ok: true, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS, limitsOutput: true, amountMicroUsd: big(10) });
  });
});

describe("withOutputLimit", () => {
  it("sets max_tokens when the client sent no limit, without touching the original body", () => {
    const body = { model: "m", messages: [] };
    expect(withOutputLimit(body, 100)).toEqual({ model: "m", messages: [], max_tokens: 100 });
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("lowers only the fields the client sent", () => {
    expect(withOutputLimit({ max_completion_tokens: 9_000 }, 100)).toEqual({ max_completion_tokens: 100 });
    expect(withOutputLimit({ max_tokens: 9_000, max_completion_tokens: 8_000 }, 100)).toEqual({ max_tokens: 100, max_completion_tokens: 100 });
    expect(withOutputLimit({ max_tokens: null }, 100)).toEqual({ max_tokens: 100 });
  });
});
