# 04 · API pública

Compatible con **OpenAI Chat Completions** ([ADR-0002](./adr/0002-api-compatible-openai.md)). Cualquier cliente que permita cambiar `base_url` funciona sin más cambios.

- **Base URL:** `https://api.cheaptokens.wtf/v1` ([ADR-0026](./adr/0026-marca-cheaptokens-wtf.md)).
- **Autenticación:** `Authorization: Bearer wtf_...`
- **Formato:** JSON, UTF-8. Los mensajes de error van siempre en inglés, porque los lee una máquina.
- **Sin CORS:** la API se llama desde un servidor, no desde el navegador. Una key en el frontend es una key filtrada.

## Endpoints del MVP

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | API key | Genera una respuesta, con o sin streaming |
| `GET` | `/v1/models` | Pública | Lista los modelos con precios, descuentos y tags |

## `POST /v1/chat/completions`

### Request

Es el body estándar de OpenAI. La única diferencia es que `model` usa el ID de cheaptokens.wtf (`autor/modelo`):

```bash
curl https://api.cheaptokens.wtf/v1/chat/completions \
  -H "Authorization: Bearer $CHEAPTOKENS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-haiku-4.5",
    "messages": [{ "role": "user", "content": "Hola" }]
  }'
```

**Python (SDK oficial de OpenAI):**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.cheaptokens.wtf/v1",
    api_key="wtf_...",
)

response = client.chat.completions.create(
    model="anthropic/claude-haiku-4.5",
    messages=[{"role": "user", "content": "Hola"}],
)
print(response.choices[0].message.content)
```

**TypeScript (SDK oficial de OpenAI):**

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.cheaptokens.wtf/v1",
  apiKey: process.env.CHEAPTOKENS_API_KEY,
});

const stream = await client.chat.completions.create({
  model: "openai/gpt-5-mini",
  messages: [{ role: "user", content: "Hola" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

> Los IDs de modelo de este documento son ilustrativos. La lista real sale de `GET /v1/models`.

### Parámetros

- **`model`** (obligatorio): un ID de cheaptokens.wtf.
- **Todo lo demás** (`messages`, `temperature`, `max_tokens`, `tools`, `tool_choice`, `response_format`, contenido con imágenes, etc.) **se reenvía tal cual al upstream.** Si un modelo no soporta un parámetro, el error del upstream vuelve como `400`.
- **`stream`** y **`stream_options.include_usage`**: se respetan. Internamente siempre pedimos `usage` al upstream, pero solo se lo reenviamos al cliente si lo pidió.

### Response

El formato estándar de OpenAI (`chat.completion` o `chat.completion.chunk`), con estas garantías:

- `model` es siempre el ID de cheaptokens.wtf que pidió el cliente.
- `id` es nuestro (`chatcmpl-<request_id>`), no el del upstream.
- **Solo pasan los campos del estándar:** `id`, `object`, `created`, `model`, `choices`, `usage`. La única excepción es `reasoning_content` en `message` y en `delta`, el razonamiento del modelo ([ADR-0031](./adr/0031-reasoning-content-pasa-al-cliente.md)). Dentro de `usage` solo pasan `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details` y `completion_tokens_details`. Todo lo demás se descarta, incluidos campos como `usage.cost` o `provider` que algunos upstreams agregan y que revelarían nuestro costo o proveedor.
- **Header `x-request-id`:** el ID para soporte, el mismo que aparece en el dashboard.

### Streaming

Server-Sent Events, igual que OpenAI:

```
data: {"id":"chatcmpl-req_...","object":"chat.completion.chunk","model":"anthropic/claude-haiku-4.5","choices":[{"index":0,"delta":{"content":"Ho"}}]}

data: {"id":"chatcmpl-req_...","object":"chat.completion.chunk","model":"anthropic/claude-haiku-4.5","choices":[{"index":0,"delta":{"content":"la"}}]}

data: [DONE]
```

- Durante esperas largas (por ejemplo, mientras razona un modelo) llegan líneas de comentario `: keep-alive`. El estándar SSE dice que se ignoran, y los SDKs ya lo hacen.
- **Si el modelo falla a mitad del stream**, el status ya es `200`, así que el error llega como un último chunk antes de `[DONE]`:

```
data: {"id":"chatcmpl-req_...","object":"chat.completion.chunk","model":"anthropic/claude-haiku-4.5","error":{"message":"The model failed while generating the response.","type":"upstream_error","code":"upstream_error"},"choices":[{"index":0,"delta":{},"finish_reason":"error"}]}

data: [DONE]
```

- Si el cliente se desconecta a la mitad, **se cobra lo que el modelo haya generado hasta terminar**, porque el upstream nos lo cobra igual ([ADR-0013](./adr/0013-medicion-con-usage-upstream.md)).

## `GET /v1/models`

Es pública: no requiere key, porque es la misma información de la página `/models`. Responde con el formato de lista de OpenAI y campos extra:

```json
{
  "object": "list",
  "data": [
    {
      "id": "anthropic/claude-haiku-4.5",
      "object": "model",
      "created": 1760000000,
      "owned_by": "anthropic",
      "name": "Claude Haiku 4.5",
      "context_length": 200000,
      "tags": ["fast", "vision", "tools", "long-context"],
      "pricing": {
        "currency": "USD",
        "unit": "1M_tokens",
        "input": "0.10",
        "output": "0.50",
        "official_input": "1.00",
        "official_output": "5.00",
        "discount_percent": 90
      },
      "status": "active"
    }
  ]
}
```

Los precios van como strings decimales para no perder precisión. Los valores de este ejemplo son ilustrativos.

## Errores

Usan el formato de OpenAI, así los SDKs los parsean sin cambios:

```json
{
  "error": {
    "message": "Insufficient credits. Top up at https://cheaptokens.wtf/dashboard/credits",
    "type": "insufficient_credits",
    "code": "insufficient_credits"
  }
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `invalid_request` | JSON inválido, falta `model` o `messages`, o el upstream rechazó un parámetro |
| 401 | `invalid_api_key` | Key ausente, mal formada, inexistente o revocada |
| 402 | `insufficient_credits` | Saldo del workspace ≤ 0 |
| 403 | `key_limit_exceeded` | La key llegó a su límite de gasto |
| 403 | `account_suspended` | Workspace suspendido (por ejemplo, por un contracargo) |
| 404 | `model_not_found` | El modelo no existe o está oculto para este usuario |
| 410 | `model_retired` | El modelo se retiró |
| 413 | `request_too_large` | Body mayor a 4.5 MB |
| 429 | `rate_limit_exceeded` | Se pasó el rate limit del workspace. Incluye `retry-after` |
| 502 | `upstream_error` | Todos los upstreams fallaron con un error |
| 503 | `no_upstream_available` | El modelo no tiene ningún upstream habilitado |
| 504 | `upstream_timeout` | Venció el timeout del primer byte en todos los upstreams |

Los mensajes nunca mencionan al upstream.

## Rate limits

- **Inicial:** 60 requests por minuto por workspace, configurable por workspace ([ADR-0017](./adr/0017-rate-limit-upstash.md)).
- Al excederlo: `429` con el header `retry-after` en segundos.

## Compatibilidad con herramientas (MVP)

| Herramienta | Estado |
|---|---|
| SDK de OpenAI (Python, JS/TS) | ✅ Objetivo principal |
| LangChain (`ChatOpenAI` con `base_url`) | ✅ |
| Vercel AI SDK (proveedor compatible con OpenAI) | ✅ |
| Editores que aceptan una base URL de OpenAI | ✅ Probar caso por caso antes de anunciarlos |
| Claude Code | ❌ Requiere `/v1/messages` (fase 2) |

## Versionado

`/v1` es estable. Agregar campos o endpoints no rompe compatibilidad. Un cambio incompatible iría en `/v2`.

## Fuera del MVP

`/v1/messages` (formato Anthropic), Responses API, `/v1/completions` (legacy), embeddings, generación de imágenes, audio, batch y `GET /v1/credits`. Ver [roadmap](./11-roadmap.md).
