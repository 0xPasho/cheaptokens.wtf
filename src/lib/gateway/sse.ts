import type { SseEvent, SseParser } from "./types";

export const SSE_KEEP_ALIVE = ": keep-alive\n\n";
export const SSE_DONE = "data: [DONE]\n\n";

export function encodeSseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function createSseParser(): SseParser {
  const decoder = new TextDecoder();
  let line = "";
  let data: string[] = [];
  let skipLf = false;
  let ended = false;

  function consume(text: string): SseEvent[] {
    const events: SseEvent[] = [];

    function finishLine() {
      if (line === "") {
        if (data.length > 0) events.push({ type: "data", data: data.join("\n") });
        data = [];
      } else if (line.startsWith(":")) {
        // El texto de los comentarios puede revelar al proveedor.
        events.push({ type: "comment" });
      } else {
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "data") data.push(value);
      }
      line = "";
    }

    for (const character of text) {
      if (skipLf) {
        skipLf = false;
        if (character === "\n") continue;
      }
      if (character === "\r" || character === "\n") {
        finishLine();
        skipLf = character === "\r";
      } else {
        line += character;
      }
    }
    return events;
  }

  return {
    push(chunk) {
      return ended ? [] : consume(decoder.decode(chunk, { stream: true }));
    },
    flush() {
      if (ended) return [];
      ended = true;
      const events = consume(decoder.decode());
      // SSE exige una línea vacía para despachar: un evento truncado no pasa.
      line = "";
      data = [];
      return events;
    },
  };
}

export async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<SseEvent> {
  const parser = createSseParser();
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(value);
    }
    yield* parser.flush();
  } finally {
    // No se cancela: el consumidor puede necesitar drenar para medir el uso.
    reader.releaseLock();
  }
}
