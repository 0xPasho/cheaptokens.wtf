# 04 · API pública

Compatible con **OpenAI Chat Completions** ([ADR-0002](./adr/0002-api-compatible-openai.md)). Cualquier cliente que permita cambiar `base_url` funciona sin más cambios. Para Claude Code y los SDKs de Anthropic hay una segunda base URL con el formato de Anthropic: ver [Formato de Anthropic](#formato-de-anthropic-anthropic).

- **Base URL:** `https://api.cheapllm.wtf/v1` ([ADR-0051](./adr/0051-marca-cheapllm-wtf.md)).
- **Autenticación:** `Authorization: Bearer wtf_...`
- **Formato:** JSON, UTF-8. Los mensajes de error van siempre en inglés, porque los lee una máquina.
- **Sin CORS:** la API se llama desde un servidor, no desde el navegador. Una key en el frontend es una key filtrada.

## Endpoints del MVP

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | API key | Genera una respuesta, con o sin streaming |
| `GET` | `/v1/models` | Pública | Lista los modelos con precios, descuentos y tags |
| `POST` | `/anthropic/v1/messages` | API key | Lo mismo con el formato de Anthropic ([ADR-0078](./adr/0078-formato-anthropic-para-claude-code.md)) |
| `POST` | `/anthropic/v1/messages/count_tokens` | API key | Estima los tokens del prompt, sin cobrar |
| `GET` | `/anthropic/v1/models` | Pública | El catálogo con la forma de Anthropic |

## `POST /v1/chat/completions`

### Request

Es el body estándar de OpenAI. La única diferencia es que `model` usa el ID de cheapllm.wtf (`autor/modelo`):

```bash
curl https://api.cheapllm.wtf/v1/chat/completions \
  -H "Authorization: Bearer $CHEAPLLM_API_KEY" \
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
    base_url="https://api.cheapllm.wtf/v1",
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
  baseURL: "https://api.cheapllm.wtf/v1",
  apiKey: process.env.CHEAPLLM_API_KEY,
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

- **`model`** (obligatorio): un ID de cheapllm.wtf.
- **Todo lo demás** (`messages`, `temperature`, `max_tokens`, `tools`, `tool_choice`, `response_format`, contenido con imágenes, etc.) **se reenvía tal cual al upstream.** Si un modelo no soporta un parámetro, el error del upstream vuelve como `400`.
- **`max_tokens`, `max_completion_tokens` y `n`:** enteros positivos o `null`; si no, `400`. Sin límite de salida, el upstream recibe como `max_tokens` la salida máxima del modelo según el proveedor, o 32 768 si no la reporta ([ADR-0067](./adr/0067-salida-maxima-por-modelo.md)). Si el saldo o el plan no alcanzan para la salida pedida, se recorta a lo que alcanza (`finish_reason: "length"`) ([ADR-0066](./adr/0066-reserva-por-request.md)).
- **`stream`** y **`stream_options.include_usage`**: se respetan. Internamente siempre pedimos `usage` al upstream, pero solo se lo reenviamos al cliente si lo pidió.

### Response

El formato estándar de OpenAI (`chat.completion` o `chat.completion.chunk`), con estas garantías:

- `model` es siempre el ID de cheapllm.wtf que pidió el cliente.
- `id` es nuestro (`chatcmpl-<request_id>`), no el del upstream.
- **Solo pasan los campos del estándar:** `id`, `object`, `created`, `model`, `choices`, `usage`. La única excepción es `reasoning_content` en `message` y en `delta`, el razonamiento del modelo ([ADR-0031](./adr/0031-reasoning-content-pasa-al-cliente.md)). Dentro de `usage` solo pasan `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details` y `completion_tokens_details`. Todo lo demás se descarta, incluidos campos como `usage.cost` o `provider` que algunos upstreams agregan y que revelarían nuestro costo o proveedor.
- **Header `x-request-id`:** el ID para soporte, el mismo que aparece en el dashboard.
- **Headers del plan,** solo si la key cobra del plan y el workspace tiene uno activo ([Límites del plan](#límites-del-plan)).

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
      "reasoning_levels": ["low", "medium", "high"],
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

`reasoning_levels` son los valores de `reasoning_effort` que aceptan todas las rutas que sirven el modelo (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`). `[]`: no acepta ninguno. Sin el campo: no se sabe. Siguen a la ruta, así que pueden cambiar con el catálogo ([ADR-0076](./adr/0076-niveles-de-razonamiento-por-modelo.md)).

## Errores

Usan el formato de OpenAI, así los SDKs los parsean sin cambios:

```json
{
  "error": {
    "message": "Insufficient credits. Top up at https://cheapllm.wtf/dashboard/credits",
    "type": "insufficient_credits",
    "code": "insufficient_credits"
  }
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `invalid_request` | JSON inválido, falta `model` o `messages`, o el upstream rechazó un parámetro |
| 401 | `invalid_api_key` | Key ausente, mal formada, inexistente, revocada o vencida después de rotarla |
| 402 | `insufficient_credits` | Nada puede pagar el request: sin plan con límite, sin paquete del modelo y con saldo ≤ 0 |
| 402 | `no_active_plan` | La key es de solo plan y el workspace no tiene un plan activo |
| 403 | `key_limit_exceeded` | La key llegó a su límite de gasto |
| 403 | `account_suspended` | Workspace suspendido (por ejemplo, por un contracargo) |
| 403 | `model_not_allowed_for_key` | La key no tiene permitido ese modelo |
| 404 | `model_not_found` | El modelo no existe o está oculto para este usuario |
| 410 | `model_retired` | El modelo se retiró |
| 413 | `request_too_large` | Body mayor a 4.5 MB |
| 429 | `rate_limit_exceeded` | Se pasó el rate limit del workspace. Incluye `retry-after` |
| 429 | `usage_limit_reached` | El plan llegó a su límite y el excedente no cubre (apagado, sin paquete o en el tope). Incluye `retry-after` hasta el reinicio |
| 503 | `upstream_error` | Todos los upstreams fallaron con un error |
| 503 | `no_upstream_available` | El modelo no tiene ningún upstream habilitado |
| 503 | `upstream_timeout` | Ningún upstream empezó a responder a tiempo |

Los mensajes nunca mencionan al upstream. Las tres fallas del upstream responden 503 y se distinguen por `code`: Cloudflare reemplaza un 502 o un 504 del origen por su propio error ([ADR-0077](./adr/0077-fallas-del-upstream-detras-de-cloudflare.md)).

## Formato de Anthropic (`/anthropic`)

Para Claude Code, el Claude Agent SDK y los SDKs de Anthropic ([ADR-0078](./adr/0078-formato-anthropic-para-claude-code.md)).

- **Base URL:** `https://api.cheapllm.wtf/anthropic`. El cliente le agrega `/v1/messages`.
- **Autenticación:** `x-api-key: wtf_...` o `Authorization: Bearer wtf_...`. La misma key de `/v1`.
- **Headers:** `anthropic-version` (por defecto `2023-06-01`) y `anthropic-beta` llegan al modelo tal cual.
- **Modelo:** nuestro ID (`anthropic/claude-sonnet-5.5`) o el de Anthropic (`claude-sonnet-5-5`, con fecha, `-latest` o `[1m]`). La respuesta repite el que mandaste.
- **Body y respuesta:** los de Anthropic. El contenido vuelve tal cual, firmas de thinking incluidas. `id`, `model` y `usage` son nuestros, sin `cost` ni campos del upstream.
- **Cobro:** el mismo de `/v1/chat/completions`, con una diferencia: si la reserva no cubre el `max_tokens` pedido, el request responde `402 billing_error` en vez de recortar la salida.
- **Streaming:** eventos con nombre (`message_start` … `message_stop`), `ping` cada 15 s sin bytes y un evento `error` si el modelo falla a mitad.
- **`count_tokens`:** una estimación local. No llama al modelo ni cobra.
- **`GET /anthropic/v1/models`:** `{ data: [{ type, id, display_name, created_at }], has_more, first_id, last_id }`, con nuestros IDs. Claude Code lo usa para llenar `/model` si tiene `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`.

### Claude Code

```sh
export ANTHROPIC_BASE_URL="https://api.cheapllm.wtf/anthropic"
export ANTHROPIC_AUTH_TOKEN="wtf_..."
claude
```

- Lo mismo va en `~/.claude/settings.json`, dentro de `"env"`. En un proyecto, en `.claude/settings.local.json`: la key nunca en el `.claude/settings.json` del repo.
- `ANTHROPIC_AUTH_TOKEN` va como `Authorization: Bearer`. `ANTHROPIC_API_KEY` va como `x-api-key` y Claude Code pide aprobarla una vez.
- Modelos: `ANTHROPIC_MODEL` (principal), `ANTHROPIC_DEFAULT_HAIKU_MODEL` (tareas de fondo) y `CLAUDE_CODE_SUBAGENT_MODEL` (subagentes), con nuestro ID o el de Anthropic. Un nombre fuera del catálogo falla en el primer request con `404`.
- Si un modelo rechaza un `anthropic-beta`, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` los quita.

### Errores del formato de Anthropic

| HTTP | `error.type` | Códigos nuestros |
|---|---|---|
| 400 | `invalid_request_error` | `invalid_request`, y el `400` del modelo |
| 401 | `authentication_error` | `invalid_api_key` |
| 402 | `billing_error` | `insufficient_credits`, `no_active_plan` |
| 403 | `permission_error` | `key_limit_exceeded`, `account_suspended`, `model_not_allowed_for_key` |
| 404 | `not_found_error` | `model_not_found`, `model_retired` |
| 413 | `request_too_large` | `request_too_large` |
| 429 | `rate_limit_error` | `rate_limit_exceeded`, `usage_limit_reached` (con `retry-after`) |
| 503 | `api_error` | `upstream_error` |
| 503 | `timeout_error` | `upstream_timeout` |
| 503 | `overloaded_error` | `no_upstream_available` |

Las tres fallas del upstream van con `503`, como en el formato OpenAI: Cloudflare tapa un 502 o un 504 del origen ([ADR-0077](./adr/0077-fallas-del-upstream-detras-de-cloudflare.md)). El `type` dice cuál fue, y los SDKs de Anthropic reintentan un 503 solos.

El `message` es el mismo del formato OpenAI. A mitad del stream, un error llega como evento `error` con el mismo body y el stream termina. Se cobra lo generado.

## Rate limits

- **Inicial:** 60 requests por minuto por workspace, configurable por workspace ([ADR-0017](./adr/0017-rate-limit-upstash.md)). Con un plan activo vale el del plan: 60 en Plus, 120 en Pro y 300 en Max. El override del workspace manda sobre los dos.
- Al excederlo: `429` con el header `retry-after` en segundos.

## Límites del plan

Con un plan, cada request gasta de dos límites lo que cuesta a precio cheapllm.wtf: una ventana de 5 horas y una semana ([ADR-0049](./adr/0049-suscripcion-con-limites.md), [08 · Créditos y pagos](./08-creditos-y-pagos.md#planes)). Cuando la key cobra del plan, cada respuesta trae:

| Header | Valor |
|---|---|
| `x-usage-window-remaining` | Lo que queda de la ventana de 5 horas **antes** de este request, de 0 a 1 con dos decimales (`0.66`) |
| `x-usage-week-remaining` | Lo mismo para la semana |
| `x-usage-window-reset` | Cuándo se reinicia la ventana, en ISO 8601. Solo si está abierta |
| `x-usage-week-reset` | Cuándo se reinicia la semana, en ISO 8601. Solo si está abierta |

- Las keys de solo créditos (`prepaid_only`) y los workspaces sin plan no reciben estos headers.
- El request que cruza el límite termina completo. Lo que no cabe se cobra a paquetes y créditos si el excedente está activo. Si no, el siguiente request recibe `429 usage_limit_reached`.

## Compatibilidad con herramientas (MVP)

| Herramienta | Estado |
|---|---|
| SDK de OpenAI (Python, JS/TS) | ✅ Objetivo principal |
| LangChain (`ChatOpenAI` con `base_url`) | ✅ |
| Vercel AI SDK (proveedor compatible con OpenAI) | ✅ |
| Editores que aceptan una base URL de OpenAI | ✅ Probar caso por caso antes de anunciarlos |
| Claude Code | ✅ Con `ANTHROPIC_BASE_URL=https://api.cheapllm.wtf/anthropic` |
| Claude Agent SDK y SDKs de Anthropic | ✅ Con la base URL de Anthropic |

## Versionado

`/v1` es estable. Agregar campos o endpoints no rompe compatibilidad. Un cambio incompatible iría en `/v2`.

## Fuera del MVP

Responses API (Codex), `/v1/completions` (legacy), embeddings, generación de imágenes, audio, batch y `GET /v1/credits`. Ver [roadmap](./11-roadmap.md).
