// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { createSseParser, encodeSseData, readSseEvents, SSE_DONE, SSE_KEEP_ALIVE } from "@/lib/gateway/sse";
import type { SseEvent } from "@/lib/gateway/types";

const encoder = new TextEncoder();

function parseParts(bytes: Uint8Array, size: number): SseEvent[] {
  const parser = createSseParser();
  const events: SseEvent[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    events.push(...parser.push(bytes.subarray(offset, offset + size)));
  }
  return [...events, ...parser.flush()];
}

function streamOf(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) controller.close();
      else {
        controller.enqueue(bytes.subarray(offset, offset + size));
        offset += size;
      }
    },
  });
}

describe("SSE fixtures", () => {
  for (const name of ["chat-stream-double-usage.sse", "chat-stream-without-stream-options.sse"]) {
    const source = readFileSync(new URL(`../../fixtures/inferhub/${name}`, import.meta.url), "utf8");
    const expected: SseEvent[] = source.split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => ({ type: "data", data: line.slice(6) }));

    it.each([1, 7, 64])(`${name}: preserves events in %i-byte parts`, async (size) => {
      const bytes = encoder.encode(source);
      expect(parseParts(bytes, size)).toEqual(expected);
      const body = streamOf(bytes, size);
      expect(await Array.fromAsync(readSseEvents(body))).toEqual(expected);
      expect(body.locked).toBe(false);
      expect(expected.at(-1)).toEqual({ type: "data", data: "[DONE]" });
      expect(expected.filter((event) => event.type === "data" && event.data !== "[DONE]"
        && JSON.parse(event.data).usage !== null)).toHaveLength(2);
    });

    it(`${name}: survives a multibyte character split at every byte`, () => {
      const changed = source.replace("Hola", "¡Hola! 👋 漢字");
      const bytes = encoder.encode(changed);
      const baseline = parseParts(bytes, bytes.length);
      expect(parseParts(bytes, 1)).toEqual(baseline);
      const split = bytes.indexOf(0xf0) + 2;
      const parser = createSseParser();
      expect([
        ...parser.push(bytes.subarray(0, split)),
        ...parser.push(bytes.subarray(split)),
        ...parser.flush(),
      ]).toEqual(baseline);
      expect(JSON.stringify(baseline)).toContain("¡Hola! 👋 漢字");
    });
  }
});

describe("SSE protocol", () => {
  it("joins data lines, preserves whitespace and discards comment text and ignored fields", () => {
    const bytes = encoder.encode("\uFEFF: InFeRhUb internal-id\r\nevent: message\r\nid: secret\r\nretry: 10\r\ndata:one\r\ndata:  two\r\ndata\r\nunknown: ignore\r\n\r\n\r\ndata:\n\ndata: [DONE]\n\n");
    expect(parseParts(bytes, 1)).toEqual([
      { type: "comment" },
      { type: "data", data: "one\n two\n" },
      { type: "data", data: "" },
      { type: "data", data: "[DONE]" },
    ]);
  });

  it("handles standalone CR, CRLF split across pushes, and all byte boundaries", () => {
    const bytes = encoder.encode(": private\rdata: ¡sí! 👋\r\ndata:tail\r\n\r\ndata:next\r\r");
    const expected = [{ type: "comment" }, { type: "data", data: "¡sí! 👋\ntail" }, { type: "data", data: "next" }];
    for (let split = 0; split <= bytes.length; split++) {
      const parser = createSseParser();
      expect([...parser.push(bytes.subarray(0, split)), ...parser.push(bytes.subarray(split)), ...parser.flush()]).toEqual(expected);
    }
  });

  it("does not dispatch a truncated event at EOF and flushes only once", () => {
    for (const source of ["data: partial", "data: partial\n", "data: partial\r\n"]) {
      const parser = createSseParser();
      expect(parser.push(encoder.encode(source))).toEqual([]);
      expect(parser.flush()).toEqual([]);
      expect(parser.flush()).toEqual([]);
    }
  });

  it.each(["data: partial", "data: partial\n", "data: partial\r\n"])("discards the final event without an empty line when reading %j", async (tail) => {
    const body = streamOf(encoder.encode(`data: complete\n\n${tail}`), 1);
    expect(await Array.fromAsync(readSseEvents(body))).toEqual([{ type: "data", data: "complete" }]);
    expect(body.locked).toBe(false);
  });

  it("emits complete events without waiting for the stream to finish", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode("data: first\n\n")); } });
    const iterator = readSseEvents(body)[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: { type: "data", data: "first" } });
    await iterator.return?.();
    expect(body.locked).toBe(false);
  });

  it("releases the reader on failure", async () => {
    const failure = new Error("disconnected");
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(failure); } });
    await expect(Array.fromAsync(readSseEvents(body))).rejects.toThrow(failure);
    expect(body.locked).toBe(false);
  });

  it("cancels and releases the reader when the consumer stops early", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode("data: first\n\n")); },
      cancel,
    });
    for await (const event of readSseEvents(body)) {
      expect(event).toEqual({ type: "data", data: "first" });
      break;
    }
    expect(body.locked).toBe(false);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("releases the reader even when cancellation fails", async () => {
    const failure = new Error("cancel failed");
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode("data: first\n\n")); },
      cancel() { throw failure; },
    });
    const iterator = readSseEvents(body)[Symbol.asyncIterator]();
    await iterator.next();
    await expect(iterator.return?.()).rejects.toThrow(failure);
    expect(body.locked).toBe(false);
  });

  it("does not cancel a stream that was read to completion", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: complete\n\n"));
        controller.close();
      },
      cancel,
    });
    expect(await Array.fromAsync(readSseEvents(body))).toEqual([{ type: "data", data: "complete" }]);
    expect(cancel).not.toHaveBeenCalled();
    expect(body.locked).toBe(false);
  });

  it("encodes JSON and exposes safe framing constants", () => {
    expect(encodeSseData({ content: "hola\n👋", count: 1 })).toBe('data: {"content":"hola\\n👋","count":1}\n\n');
    expect(encodeSseData(null)).toBe("data: null\n\n");
    expect(SSE_DONE).toBe("data: [DONE]\n\n");
    expect(SSE_KEEP_ALIVE).toBe(": keep-alive\n\n");
  });
});
