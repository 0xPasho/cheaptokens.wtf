// @vitest-environment node
import { describe, expect, it } from "vitest";

import { validateChatRequest } from "@/lib/gateway/validate";

const valid = { model: "author/model", messages: [{ role: "user", content: "Hola" }] };

describe("validateChatRequest", () => {
  it("defaults streaming flags and keeps the original body", () => {
    const result = validateChatRequest(valid);
    expect(result).toEqual({ ok: true, body: valid, model: valid.model, stream: false, includeUsage: false });
    if (result.ok) expect(result.body).toBe(valid);
  });

  it.each([true, false])("respects include_usage=%s", (includeUsage) => {
    const body = { ...valid, stream: true, stream_options: { include_usage: includeUsage, extra: "preserved" } };
    expect(validateChatRequest(body)).toEqual({ ok: true, body, model: body.model, stream: true, includeUsage });
  });

  it.each([
    { stream: null }, { stream_options: null }, { stream: null, stream_options: null },
    { stream: false, stream_options: null },
  ])("treats nullable streaming fields as absent: %j", (fields) => {
    const body = { ...valid, ...fields };
    expect(validateChatRequest(body)).toEqual({ ok: true, body, model: body.model, stream: false, includeUsage: false });
  });

  it("accepts null stream_options while streaming", () => {
    const body = { ...valid, stream: true, stream_options: null };
    expect(validateChatRequest(body)).toEqual({ ok: true, body, model: body.model, stream: true, includeUsage: false });
  });

  it("accepts include_usage with null stream", () => {
    expect(validateChatRequest({ ...valid, stream: null, stream_options: { include_usage: true } }))
      .toMatchObject({ ok: true, stream: false, includeUsage: true });
  });

  it.each([null, undefined, [], "body", 42, true])("rejects non-object body %j", (body) => {
    expect(validateChatRequest(body)).toEqual({ ok: false, message: "The request body must be a JSON object." });
  });

  it.each([undefined, null, "", " \n\t", 1, {}, []])("rejects invalid model %j", (model) => {
    expect(validateChatRequest({ ...valid, model })).toEqual({ ok: false, message: "The 'model' field must be a non-empty string." });
  });

  it.each([undefined, null, [], "messages", {}, [null], [[]], ["user"], [{}], [{ role: null }], [{ role: 1 }]])("rejects invalid messages %j", (messages) => {
    expect(validateChatRequest({ ...valid, messages }).ok).toBe(false);
  });

  it.each([undefined, "true", 1, {}, []])("rejects non-boolean stream %j", (stream) => {
    expect(validateChatRequest({ ...valid, stream })).toEqual({ ok: false, message: "The 'stream' field must be a boolean." });
  });

  it.each([undefined, true, [], "options", { include_usage: null }, { include_usage: undefined }, { include_usage: "true" }, { include_usage: 1 }])("rejects invalid stream options %j", (stream_options) => {
    expect(validateChatRequest({ ...valid, stream_options }).ok).toBe(false);
  });

  it("passes all other parameters and message contents through without normalization", () => {
    const body = {
      model: " author/model ",
      messages: [{ role: "custom-role", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }], future: 3 }, { role: "" }],
      temperature: "model decides",
      max_tokens: -1,
      tools: [{ type: "function", function: { name: "weather" } }],
      tool_choice: "auto",
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      future_parameter: { nested: true },
      stream: false,
      stream_options: { include_usage: true },
    };
    expect(validateChatRequest(body)).toEqual({ ok: true, body, model: " author/model ", stream: false, includeUsage: true });
  });

  it("accepts stream_options without include_usage", () => {
    expect(validateChatRequest({ ...valid, stream_options: { future: true } })).toMatchObject({ ok: true, includeUsage: false });
  });
});
