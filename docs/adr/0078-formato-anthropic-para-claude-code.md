# ADR-0078: El formato de Anthropic en `/anthropic`, para Claude Code y los SDKs de Anthropic

- **Estado:** Aceptada. Amplía [ADR-0002](./0002-api-compatible-openai.md): Claude Code deja de estar fuera. `/v1/chat/completions` no cambia.
- **Fecha:** 2026-11-24
- **Origen:** Usuario (que funcione también con la URL de Anthropic, bien hecho) + Default (rutas, nombres de modelo, errores, cobro y qué se reenvía)

## Contexto

- Claude Code, el Claude Agent SDK y los SDKs de Anthropic hablan el formato de Anthropic (`POST /v1/messages`). No aceptan una base URL de OpenAI.
- InferHub ya expone `/v1/messages` con el SSE nativo de Anthropic y acepta los headers de precio máximo. Traducir entre formatos no hace falta: basta un adaptador.
- Claude Code arma la ruta desde `ANTHROPIC_BASE_URL` agregando `/v1/messages`. Si la base fuera `https://api.cheapllm.wtf`, chocaría con nuestro `/v1`. Hace falta un prefijo propio.

## Decisión

- **Base URL:** `https://api.cheapllm.wtf/anthropic`. Rutas:

  | Método | Ruta | Auth | Qué hace |
  |---|---|---|---|
  | `POST` | `/anthropic/v1/messages` | API key | Genera una respuesta, con o sin streaming |
  | `POST` | `/anthropic/v1/messages/count_tokens` | API key | Estima los tokens del prompt. No llama al modelo ni cobra |
  | `GET` | `/anthropic/v1/models` | Pública | El catálogo con la forma de Anthropic |
  | `GET` | `/anthropic/v1/models/{id}` | Pública | Un modelo, por nuestro ID o por el de Anthropic |

- **Misma key y mismo cobro.** La key va en `x-api-key` o en `Authorization: Bearer`, y pasa por la misma autenticación, el mismo rate limit, la misma reserva ([ADR-0066](./0066-reserva-por-request.md)) y el mismo cobro por el costo que reporta el upstream ([ADR-0054](./0054-cobro-por-costo-real.md)). La reserva vive en `src/lib/gateway/admission.ts`, compartida por los dos formatos.
- **Sin recorte de salida.** Si el saldo o el plan no alcanzan para el `max_tokens` pedido, el request se rechaza con `billing_error` antes de llamar al modelo. En OpenAI se recorta y llega `finish_reason: "length"`. Un agente que recibe un turno cortado a mitad de una herramienta se rompe, y un error claro se puede leer. `max_tokens` solo baja si pasa de la salida máxima del modelo, porque ahí el resultado es el mismo.
- **Nombres de modelo.** Vale nuestro ID (`anthropic/claude-sonnet-5.5`) y el de Anthropic (`claude-sonnet-5-5`, con fecha, `-latest` o el sufijo `[1m]` de Claude Code). `modelCandidates` prueba, en orden, el nombre tal cual, sin sufijos, con `-5-5` como `-5.5` y con el prefijo `anthropic/`. La respuesta repite el nombre que mandó el cliente.
- **Qué se reenvía.**
  - El body va tal cual, con nuestro ID de modelo: thinking, herramientas, imágenes, PDF, `cache_control` y `metadata` los decide el modelo.
  - `anthropic-version` (o `2023-06-01` si falta) y `anthropic-beta` pasan tal cual. Nunca la key del cliente.
  - El contenido de la respuesta vuelve byte por byte. Los bloques de thinking conservan su `signature`, así que sirven en el turno siguiente.
- **Qué se oculta del upstream.** El `id` es `msg_` más nuestro request id y el `model` es el del cliente. `usage` lleva solo los contadores de Anthropic, sin `cost`. Ningún header, campo ni evento propio del upstream llega al cliente. Los eventos de stream que no son de Anthropic se descartan.
- **Streaming.**
  - Los eventos salen con su nombre (`event: message_start`…), en el orden en que llegan.
  - Un comentario del upstream o 15 s sin bytes mandan un `ping`, porque Cloudflare corta a los 100 s de silencio.
  - El stream del cliente se cierra en `message_stop`. Lo que el upstream mande después se lee solo para el costo.
  - Un error a mitad del stream, o un corte sin `message_stop`, llega como evento `error` con el formato de Anthropic. Se cobra lo generado.
  - Cancelar no corta al upstream y se cobra lo que generó, como en [ADR-0013](./0013-medicion-con-usage-upstream.md).
- **Medición.** El prompt es `input_tokens` más `cache_creation_input_tokens` más `cache_read_input_tokens`, y la caché leída queda en `cachedTokens`. La salida es el último `output_tokens`. Sin `usage`, se estima a caracteres ÷ 4.
- **Reserva del prompt.** Una imagen cuenta como un bloque fijo y un PDF por sus bytes decodificados, en vez de su base64. Ninguna reserva pasa del contexto del modelo.
- **Errores.** El body es `{"type":"error","error":{"type","message"}}` y cada respuesta lleva `request-id`. Los códigos se mapean así:

  | Código nuestro | HTTP | Tipo de Anthropic |
  |---|---|---|
  | `invalid_request`, también el `400` del modelo | 400 | `invalid_request_error` |
  | `invalid_api_key` | 401 | `authentication_error` |
  | `key_limit_exceeded`, `account_suspended`, `model_not_allowed_for_key` | 403 | `permission_error` |
  | `insufficient_credits`, `no_active_plan` | 402 | `billing_error` |
  | `model_not_found`, `model_retired` | 404 | `not_found_error` |
  | `request_too_large` | 413 | `request_too_large` |
  | `rate_limit_exceeded`, `usage_limit_reached` | 429 | `rate_limit_error` |
  | `upstream_error` | 503 | `api_error` |
  | `upstream_timeout` | 503 | `timeout_error` |
  | `no_upstream_available` | 503 | `overloaded_error` |

  Anthropic usa 500, 504 y 529 para esos tres. Aquí van con 503 por la misma razón que en el formato OpenAI: Cloudflare cambia un 502 o un 504 del origen por su propio error, y no está documentado que deje pasar un 500 o un 529 ([ADR-0077](./0077-fallas-del-upstream-detras-de-cloudflare.md)). El `type` del body sigue diciendo cuál fue, y los SDKs de Anthropic reintentan un 503.

- **`count_tokens`** es una estimación local, sin llamar al upstream. Claude Code la usa para decidir cuándo compactar. Una estimación conservadora basta, y no le cuesta nada al usuario.
- **`/anthropic/` queda fuera del proxy de Clerk** (`src/proxy.ts`), como `/v1`. nginx ya lo sirve con `location /` y sin buffer.

## Consecuencias

- Claude Code funciona con `ANTHROPIC_BASE_URL=https://api.cheapllm.wtf/anthropic` y la key en `ANTHROPIC_AUTH_TOKEN`. Los docs, la landing y la tabla de compatibilidad lo dicen.
- Hay pruebas de punta a punta con el SDK oficial de Anthropic contra el gateway (`tests/gateway/anthropic-sdk.test.ts`). El SDK queda como dependencia de desarrollo.
- El ahorro frente al precio oficial no descuenta la caché de Anthropic, igual que en `/v1/chat/completions`. Si el upstream no reporta costo, la caché se cobra al precio de entrada del catálogo. Nunca cuesta más que la entrada normal.
- Que un modelo que no es de Anthropic responda por `/messages` depende del upstream. Los docs solo prometen los de Anthropic.
- La Responses API (Codex) sigue fuera. Iría en `/v1/responses` con la misma reserva compartida.

## Alternativas descartadas

- **Traducir `/v1/messages` a Chat Completions:** pierde las firmas de thinking, `cache_control` y los bloques de herramientas. El upstream ya habla el formato.
- **`/v1/messages` en la raíz de la API:** Claude Code no lo encontraría (arma `/v1/messages` sobre la base) y mezclaría dos formatos de error en `/v1`.
- **Recortar `max_tokens` como en OpenAI:** un agente con un turno cortado falla de forma confusa. Es mejor un `billing_error` claro.
- **`count_tokens` contra el upstream:** cuesta una llamada por turno y otro punto de falla, para un número que solo tiene que ser aproximado.
