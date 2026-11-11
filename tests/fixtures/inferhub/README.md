# Respuestas reales de InferHub

Se capturaron el 2026-11-10 al probar InferHub como upstream ([ADR-0028](../../../docs/adr/0028-inferhub-upstream-de-pruebas.md)). Son la entrada de las pruebas del parser SSE, del saneo y de la medición. No contienen la key.

| Archivo | Qué muestra |
|---|---|
| `chat-stream-double-usage.sse` | Stream de `alicn/deepseek-v4.1-flash` con `stream_options.include_usage`. Trae `reasoning_content` y **dos chunks de `usage`**: el del vendedor y el de InferHub, con `cost` y sin `id`, `model` ni `created` |
| `chat-stream-without-stream-options.sse` | Stream de `alicn/qwen3.8-flash` sin `stream_options`: el `usage` llega igual |
| `chat-reasoning-length.json` | Respuesta sin stream donde el razonamiento se comió el `max_tokens`: `content: ""` y `finish_reason: "length"` |
| `chat-estimated-usage.json` | `kiro/claude-haiku-4.5`: `usage` de 5 y 1 tokens, que coincide con caracteres ÷ 4 |
| `errors.json` | Errores reales: `404` de modelo, `401` de key, `400` del vendedor con `source: "Qwencloud/Alibaba CN"`, y `402 no_provider_under_bid` |
| `response-headers.txt` | Headers de una respuesta. Ninguno puede llegar al cliente |
