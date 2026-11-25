// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";

import { requests } from "@/lib/db/schema";

import { startGatewayHarness, type GatewayHarnessOptions } from "../helpers/gateway-harness";
import { MOCK_THINKING_SIGNATURE } from "../helpers/mock-upstream";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;
const harnesses: Harness[] = [];

async function start(options?: GatewayHarnessOptions) {
  const harness = await startGatewayHarness(options);
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

/**
 * El SDK oficial de Anthropic contra `/anthropic`, cambiando solo la URL base y la key: lo mismo que hacen Claude Code
 * (`ANTHROPIC_BASE_URL`) y el Claude Agent SDK (ADR-0078). `maxRetries: 0` para que un error se vea al primer intento.
 */
function client(harness: Harness, auth: { apiKey: string } | { authToken: string } = { apiKey: harness.apiKey }) {
  return new Anthropic({ baseURL: harness.anthropicBaseUrl, maxRetries: 0, ...("apiKey" in auth ? auth : { apiKey: null, ...auth }) });
}

const prompt = [{ role: "user" as const, content: "Lee el archivo y dime qué hace." }];

describe("Anthropic SDK against /anthropic", () => {
  it("creates a message and keeps the thinking signature", async () => {
    const harness = await start();
    const message = await client(harness).messages.create({ model: "claude-haiku-4-5", max_tokens: 2048, messages: prompt });
    expect(message.type).toBe("message");
    expect(message.content[0]).toEqual({ type: "thinking", thinking: "We need answer in Spanish.", signature: MOCK_THINKING_SIGNATURE });
    expect(message.content[1]).toMatchObject({ type: "text" });
    expect(message.usage.input_tokens).toBeGreaterThan(0);
  });

  it("streams with messages.stream() and accumulates the final message", async () => {
    const harness = await start();
    const stream = client(harness).messages.stream({ model: "claude-haiku-4-5", max_tokens: 2048, messages: prompt });
    let text = "";
    stream.on("text", (delta) => { text += delta; });
    const final = await stream.finalMessage();
    expect(text).toBe("Hola 🌎. ".repeat(3));
    expect(final.stop_reason).toBe("end_turn");
    expect(final.content[0]).toMatchObject({ type: "thinking", signature: MOCK_THINKING_SIGNATURE });
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toEqual([expect.objectContaining({ status: "success", stream: true })]);
  });

  it("streams tool use with parsed input", async () => {
    const harness = await start();
    const final = await client(harness).messages.stream({
      model: "claude-haiku-4-5", max_tokens: 2048, messages: prompt,
      tools: [{ name: "get_weather", description: "Weather", input_schema: { type: "object", properties: { location: { type: "string" } } } }],
      // El escenario del mock viaja en el body, como en las demás pruebas del gateway.
      ...({ x_mock: { scenario: "tool-use" } } as object),
    }).finalMessage();
    expect(final.stop_reason).toBe("tool_use");
    expect(final.content[1]).toMatchObject({ type: "tool_use", name: "get_weather", input: { location: "Ciudad de México", unit: "celsius" } });
  });

  it("counts tokens and works with ANTHROPIC_AUTH_TOKEN", async () => {
    const harness = await start();
    const count = await client(harness, { authToken: harness.apiKey }).messages.countTokens({ model: "claude-haiku-4-5", messages: prompt });
    expect(count.input_tokens).toBeGreaterThan(0);
  });

  it("surfaces Anthropic's error classes", async () => {
    const harness = await start({ balanceUsd: "0.01" });
    await expect(client(harness, { apiKey: "wtf_invalid" }).messages.create({ model: "claude-haiku-4-5", max_tokens: 1024, messages: prompt }))
      .rejects.toBeInstanceOf(Anthropic.AuthenticationError);
    // Con 64k de salida el SDK exige streaming, como Claude Code: el error llega antes del primer evento.
    await expect(client(harness).messages.stream({ model: "claude-haiku-4-5", max_tokens: 64_000, messages: prompt }).finalMessage())
      .rejects.toMatchObject({ status: 402, error: { type: "error", error: { type: "billing_error" } } });
    await expect(client(harness).messages.create({ model: "claude-nonexistent-9", max_tokens: 1024, messages: prompt }))
      .rejects.toBeInstanceOf(Anthropic.NotFoundError);
  });
});
