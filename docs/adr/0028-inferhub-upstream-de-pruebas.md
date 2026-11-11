# ADR-0028: InferHub es el upstream de la fase de pruebas

- **Estado:** Aceptada. Reemplaza a [ADR-0024](./0024-openrouter-upstream-de-pruebas.md).
- **Fecha:** 2026-11-10
- **Origen:** Usuario (usar InferHub, con la cuenta que ya tiene saldo) + Default (cómo lo maneja el gateway)

## Contexto

- El dueño ya usa InferHub desde sus herramientas de código y tiene saldo cargado. Pidió construir y probar el gateway contra InferHub, no contra OpenRouter. La key de OpenRouter de [ADR-0024](./0024-openrouter-upstream-de-pruebas.md) nunca se creó.
- **InferHub es un mercado:** cada modelo tiene varios vendedores (*publishers*), cada uno con su precio (*ask*). El router de InferHub elige al más barato que tenga capacidad. Sus términos lo describen como *"a reverse proxy and marketplace that resells access to upstream LLM subscription entitlements"*: los vendedores conectan suscripciones de Claude, Codex y otras.
- Se probó el 2026-11-10 con modelos baratos. El gasto total fue menor a $0.001. Las respuestas reales están en `tests/fixtures/inferhub/`.

### Qué se encontró

| Comportamiento de InferHub | Evidencia |
|---|---|
| `POST /v1/chat/completions` compatible con OpenAI, con streaming SSE y tools | Funcionó con y sin stream; `tool_calls` correcto en `alicn/deepseek-v4.1-flash` |
| `GET /v1/models` es público y trae, por modelo, el precio oficial y la lista de asks | 490 modelos, 218 de ellos alias sin precio |
| **El costo real no es el ask más barato.** Toca el vendedor que tenga capacidad | `alicn/qwen3.8-flash`: el ask mínimo es $0.00015/1M, pero 35,031 tokens costaron $0.000615 (= $0.01755/1M, el segundo ask y el 11.7% del oficial) |
| **Cobro mínimo de $0.00001 (10 µUSD) por request facturado.** Los fallidos y los que no generan nada no se cobran | Documentación de InferHub. Todos los requests chicos reportaron `cost: 0.00001` |
| `usage` viene **siempre**, también sin `stream_options.include_usage`, con `usage.cost` en USD | Las dos variantes de stream |
| **En streaming llegan dos chunks de `usage`:** primero el del vendedor (con `id` y `model`) y después el de InferHub (con `cost`, sin `id`, `model` ni `created`) | `chat-stream-double-usage.sse` |
| Los modelos de razonamiento mandan `reasoning_content` (fuera del estándar) y esos tokens se comen el `max_tokens` | Dos respuestas con `content: ""` y `finish_reason: "length"` |
| `reasoning_effort: "none"` apaga el razonamiento en los modelos que lo permiten | `alicn/qwen3.8-flash` |
| **Revela el upstream en todos lados:** headers `x-inferhub-*` (incluido el UUID del vendedor), `request_id` extra en el body, `error.source: "inferhub"` y hasta el nombre del proveedor real (`"source": "Qwencloud/Alibaba CN"`) | `errors.json` |
| Un body inválido no lo valida InferHub: llega al vendedor y su error vuelve tal cual | `errors.json` → `publisher_400` |
| **Tope de precio por request:** `x-max-input-price` y `x-max-output-price` (USD por 1M). Si ningún vendedor entra, `402 no_provider_under_bid` sin costo | `errors.json` → `no_provider_under_bid` |
| Rate limit de la cuenta: `x-ratelimit-limit: 1000` | Headers de cada respuesta |
| **No hay endpoint de saldo** | Se probaron `/v1/credits`, `/v1/balance`, `/v1/usage` y otros: todos `404` |
| **El `usage` depende del vendedor.** Con el mismo prompt (3 palabras) a Claude Haiku 4.5: `ant/` reportó 43 tokens de prompt y 51 de salida con `max_tokens: 10` (42 de razonamiento que no se pidió). `kiro/` reportó 5 y 1, justo caracteres ÷ 4 | Requests del 2026-11-10 |

### Contra la [lista de requisitos](../07-upstreams.md#requisitos-para-aceptar-un-upstream)

| Requisito | InferHub |
|---|---|
| Sus términos permiten revender | ✅ **Solo los modelos pagados** (Sección 6). Prohíbe revender el *free pool* y presentar el acceso como oferta oficial de InferHub o del proveedor |
| Su costo deja margen | ✅ En lo medido: 11.7% del oficial en Qwen 3.8 Flash y 19.9% en Claude Haiku 4.5. Depende del vendedor que toque |
| Compatible con OpenAI, con SSE | ✅ |
| Reporta `usage` | ⚠️ Siempre, pero duplicado en streaming y, con algunos vendedores, estimado |
| Saldo prepagado y precio publicado | ✅ Se fondea con USDC en Solana. El saldo no es reembolsable (Sección 8) |
| Prueba de fidelidad | ❌ Pendiente. Las cifras de `usage` de arriba son una señal de alerta |
| Sabemos qué hace con los datos | ⚠️ InferHub no guarda contenido, salvo dos casos acotados (7 y 14 días, cifrado). No dice nada de los vendedores, y el contenido pasa por suscripciones cuyos términos no controlamos |
| Disponibilidad probada una semana | Pendiente |
| Endpoint de saldo | ❌ No existe |

## Decisión

- **InferHub es el upstream real de la fase de pruebas** (desarrollo, previews y pruebas cerradas). **No es una decisión sobre producción:** los upstreams de producción siguen abiertos ([12 · Preguntas abiertas #1](../12-preguntas-abiertas.md#1-elegir-los-upstreams-de-producción)).
- **OpenRouter sale del plan.** No se crea su key.
- **Configuración:** `id: "inferhub"`, base URL `https://api.inferhub.dev/v1`, key en `UPSTREAM_INFERHUB_API_KEY`. **Es una key solo para cheaptokens.wtf**, distinta de la que usan las herramientas de código del dueño, para que el gasto se pueda conciliar.
- **Solo modelos pagados.** El catálogo no mapea modelos del *free pool* ni alias: siempre el ID `prefijo/modelo` explícito.
- **Tope de precio en cada request:** el gateway manda `x-max-input-price` y `x-max-output-price` con el costo del mapeo (`cost_input_micro_usd` / `cost_output_micro_usd`). Así InferHub nunca nos cobra más de lo que el catálogo supone, y el margen de [ADR-0010](./0010-precio-por-descuento.md) se cumple por request, no solo al sincronizar.
- **`402 no_provider_under_bid` no es falta de saldo:** hace fallback sin alerta crítica. Solo un `402` sin ese código dispara la alerta de saldo.
- **Costo:** se guarda `usage.cost` del último chunk de `usage` que lo traiga, convertido a µUSD hacia arriba. Si no llega, se usa el costo del mapeo.
- **Streaming:** el gateway junta los dos chunks de `usage` en uno solo, con nuestro `id` y `model`, y lo reenvía solo si el cliente lo pidió.
- **Saneo:** no pasa ningún header `x-inferhub-*`, ni `request_id`, ni `error.source`. El gateway valida lo mínimo del body (`model`, `messages` no vacío) antes de mandarlo, para que los errores triviales no lleguen al vendedor.
- **Se sigue con el upstream simulado** para los tests automáticos y como segundo upstream para probar el fallback.
- **Las pruebas en vivo usan modelos baratos** (Qwen 3.8 Flash con `reasoning_effort: "none"`) y corren solo cuando se piden a mano.

## Consecuencias

- El gateway se puede construir y probar de punta a punta hoy, con una cuenta que ya tiene saldo.
- **A diferencia de OpenRouter, los requests de prueba sí dejan margen** en los modelos medidos. La validación de margen puede quedar estricta antes de producción para los mapeos de InferHub.
- **El cobro mínimo de 10 µUSD** hace que un request muy chico nos cueste más de lo que cobramos con la fórmula de [06](../06-catalogo-y-precios.md#costo-de-un-request). Por eso se cobra un mínimo igual ([ADR-0030](./0030-cobro-minimo-por-request.md)).
- **El tope de precio cambia el fallback:** con un costo de mapeo bajo, InferHub puede no tener vendedor disponible. Ese `402` se trata como cualquier fallo del upstream.
- **Conciliar es manual:** no hay endpoint de saldo, así que se compara Σ `upstream_cost_micro_usd` con el dashboard de InferHub.
- **El riesgo de fuente gris de [07](../07-upstreams.md#riesgos-y-mitigaciones) es explícito aquí:** los vendedores revenden suscripciones, y los términos de InferHub dejan el cumplimiento en ellos (Sección 7). InferHub puede suspender la cuenta sin aviso y quedarse con el saldo (Secciones 8 y 16). Por eso el saldo se mantiene bajo.
- **Para producción falta,** como mínimo: la prueba de fidelidad, una semana de disponibilidad, saber qué hacen los vendedores con el contenido, y que el contador valide pagar a un proveedor extranjero con USDC.

## Alternativas descartadas

- **OpenRouter ([ADR-0024](./0024-openrouter-upstream-de-pruebas.md)):** no había key, su costo es el oficial o más y sus términos prohíben la reventa. InferHub ya tiene saldo y deja margen.
- **Usar la key que ya usan las herramientas del dueño:** mezclaría ese gasto con el del gateway y haría imposible conciliar.
- **Dejar que InferHub elija sin tope de precio:** el costo variaría con el vendedor de turno y podría superar nuestro precio.
- **Tomar el ask mínimo de `GET /v1/models` como costo del catálogo:** el request medido costó 117 veces ese ask.
