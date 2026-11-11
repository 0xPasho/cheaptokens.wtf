# 07 · Upstreams

## Qué son y por qué existen

Un **upstream** es una plataforma externa que expone muchos modelos detrás de **una sola URL**, vende tokens por debajo del precio oficial y nos deja comprarlos por adelantado. **Es de donde sale el descuento** ([ADR-0001](./adr/0001-upstreams-agregadores.md)).

```
Cliente ──▶ cheaptokens.wtf ──▶ Upstream (agregador) ──▶ Proveedor del modelo
            (precio P)       (costo C)                 (precio oficial O)
```

cheaptokens.wtf agrega cuatro cosas encima de los upstreams:

- una sola cuenta, key y saldo para el usuario;
- un catálogo con precios claros;
- fallback entre upstreams;
- la libertad de cambiar de upstream sin que el cliente se entere.

## Requisitos para aceptar un upstream

**Fase de pruebas:** el único upstream real es InferHub ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)). Esta lista se aplica al elegir los upstreams de producción, cuando cierre esa fase. Cómo sale InferHub contra esta lista está en el ADR.

Antes de mapear un modelo a un upstream de producción, el upstream tiene que pasar esta lista:

- [ ] **Sus términos permiten revender el acceso**, o dárselo a nuestros clientes a través de nuestro producto. Si el texto es ambiguo, se pide confirmación por escrito y se guarda como evidencia.
- [ ] **Su costo deja margen** con el descuento que queremos mostrar: precio cheaptokens.wtf ≥ costo × (1 + `MIN_MARGIN`) ([ADR-0010](./adr/0010-precio-por-descuento.md)).
- [ ] Expone `POST /chat/completions` **compatible con OpenAI**, con streaming SSE.
- [ ] **Reporta `usage`** en respuestas sin streaming y en el último chunk del stream (por defecto o con `stream_options.include_usage`). Sin `usage` confiable no podemos cobrar bien.
- [ ] Permite saldo prepagado o una facturación clara, con el precio por modelo publicado.
- [ ] **Prueba de fidelidad aprobada.** Se mandan prompts idénticos al upstream y al proveedor oficial y se comparan los `prompt_tokens` reportados. Un tokenizer distinto delata que sirven otro modelo. Además se comparan calidad y latencia en un set pequeño de prompts.
- [ ] Sabemos qué hace con los datos: si retiene prompts o entrena con ellos. Lo necesitamos para nuestra política de privacidad.
- [ ] Tiene un historial de disponibilidad razonable (probado al menos una semana antes de mandarle tráfico real).
- [ ] Deseable: un endpoint para consultar el saldo, para monitorearlo.

## Configuración

Cada upstream vive en `catalog/upstreams.ts` ([06 · Catálogo](./06-catalogo-y-precios.md#fuente-de-verdad-y-sincronización)). El ejemplo concreto está en [InferHub en la fase de pruebas](#inferhub-en-la-fase-de-pruebas).

- La API key de cada upstream está **solo** en una variable de entorno de Vercel.
- `costInputPer1M` / `costOutputPer1M` son el **costo efectivo**: incluyen cualquier comisión del upstream (por ejemplo, la que cobra al comprar créditos).
- Un modelo puede estar mapeado a varios upstreams. En producción, la meta es tener **al menos dos** para los modelos más usados.

## InferHub en la fase de pruebas

([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md))

Es el upstream real mientras dura la fase de pruebas. Es un mercado: cada modelo tiene varios vendedores, cada uno con su precio (*ask*), y InferHub elige al más barato que tenga capacidad.

```ts
// catalog/upstreams.ts (fase de pruebas)
{
  id: "inferhub",
  name: "InferHub",
  baseUrl: "https://api.inferhub.dev/v1",
  apiKeyEnv: "UPSTREAM_INFERHUB_API_KEY", // nombre de la env var, nunca el valor
  models: [
    {
      model: "anthropic/claude-haiku-4.5",  // ID de cheaptokens.wtf
      upstreamModel: "ant/claude-haiku-4-5", // prefijo/modelo de InferHub, nunca un alias
      costInputPer1M: 0.199,                 // USD: el ask que se aceptan. Va como tope en cada request
      costOutputPer1M: 0.995,
      priority: 1,                           // menor = se intenta primero
    },
  ],
}
```

**Qué tiene en particular y cómo lo maneja el gateway** (probado el 2026-11-10; las respuestas reales están en `tests/fixtures/inferhub/`):

| Comportamiento de InferHub | Qué hace el gateway |
|---|---|
| El costo depende del vendedor que toque, no del ask mínimo de `GET /v1/models` | Manda `x-max-input-price` y `x-max-output-price` con el costo del mapeo, en USD por 1M. InferHub nunca cobra más que eso |
| `402 no_provider_under_bid` cuando ningún vendedor entra en el tope | Fallback **sin** alerta crítica. Solo un `402` con otro código es falta de saldo |
| Cobro mínimo de $0.00001 (10 µUSD) por request facturado | Se registra el costo real, y al cliente se le cobra el mismo mínimo ([ADR-0030](./adr/0030-cobro-minimo-por-request.md)) |
| `usage` viene **siempre**, con `cost` en USD | `usage.cost` se convierte a µUSD hacia arriba, se guarda como `upstream_cost_micro_usd` y se quita de la respuesta |
| **En streaming llegan dos chunks de `usage`:** el del vendedor y, al final, el de InferHub con `cost` y sin `id` ni `model` | Se juntan en uno solo, con nuestro `id` y `model`. Se reenvía solo si el cliente lo pidió |
| Headers `x-inferhub-*` (incluido el UUID del vendedor), `request_id` en el body y `error.source` con el nombre del proveedor real | Nada de eso pasa: se aplican las reglas de [Ocultar el upstream](#ocultar-el-upstream) |
| No valida el body: un request inválido llega al vendedor y su error vuelve tal cual | El gateway valida `model` y `messages` antes de mandarlo, y sanea el `400` |
| Los modelos de razonamiento mandan `reasoning_content` y esos tokens se comen el `max_tokens` | `reasoning_content` pasa al cliente ([ADR-0031](./adr/0031-reasoning-content-pasa-al-cliente.md)) |
| El `usage` depende del vendedor: unos lo estiman (caracteres ÷ 4) y otros cobran más tokens de salida que el `max_tokens` pedido | Se cobra lo reportado ([ADR-0013](./adr/0013-medicion-con-usage-upstream.md)). Es lo primero que revisa la prueba de fidelidad antes de producción |
| No hay endpoint de saldo, y la cuenta se fondea con USDC en Solana | La conciliación es manual, contra su dashboard. Saldo bajo |
| No se sabe si deja de cobrar al abortar un stream | Se drena el stream ([ADR-0013](./adr/0013-medicion-con-usage-upstream.md)) |

**Reglas que aplican a cualquier upstream** (venían de OpenRouter y se mantienen):

- **Todo comentario SSE se reemplaza por `: keep-alive`.** Algunos upstreams revelan su nombre en ellos.
- **Un error a mitad del stream puede llegar con HTTP 200,** como un chunk con `error` en la raíz. Se traduce a nuestro formato ([04 · API › Streaming](./04-api.md#streaming)). Si todavía no salió ningún chunk de datos, hay fallback.
- **Un stream que termina sin contenido ni `usage` cuenta como falla.**

**Antes de la primera prueba:**

- [ ] Crear una key de InferHub solo para cheaptokens.wtf, distinta de la que usan otras herramientas, y guardarla en `UPSTREAM_INFERHUB_API_KEY` (local y previews).
- [ ] Armar un catálogo de pruebas con 3–5 modelos de distintos autores y tags que InferHub sirva de verdad (definido en [ADR-0029](./adr/0029-catalogo-de-pruebas-inferhub.md)).
- [ ] Antes de sincronizar, verificar en `GET /v1/models` el ID de cada modelo y el ask que se va a usar como costo.

## Tests automáticos: el upstream simulado

Complementa a InferHub: sirve para los tests automáticos y para provocar a voluntad lo que con un upstream real no se puede ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)):

- **`scripts/mock-upstream.ts`** levanta un servidor local compatible con OpenAI (`POST /chat/completions`, con y sin streaming).
- **Es configurable por request** (por ejemplo, con un header o con el nombre del modelo): latencia al primer byte, número de chunks, `usage` presente o ausente, y errores `429`, `5xx`, `402` o un corte a la mitad del stream.
- Con eso se prueban el fallback, el cobro, el drenado al cancelar, la sanitización y la conciliación. El mock imita a propósito lo que hace InferHub: agrega `usage.cost`, `provider`, `request_id`, `error.source` y headers `x-inferhub-*`, y manda dos chunks de `usage`, para verificar que el gateway los maneja.
- En los previews se registra con prioridad 2 detrás de InferHub, para probar el fallback con tráfico real.
- Se registra como upstream `mock` solo en los catálogos de desarrollo y preview. **La sincronización rechaza `mock` en producción.**

## Selección y fallback

1. Se toman los mapeos del modelo con `enabled = true` y `ops_disabled_at IS NULL`, ordenados por `priority`.
2. Si no queda ninguno, `503 no_upstream_available`.
3. Se intenta el primero. Hay fallback al siguiente **solo si el fallo ocurre antes de mandarle al cliente el primer chunk de datos**. Hasta ese momento no se envían headers, así que todavía se puede responder con cualquier status:

| Respuesta del upstream | ¿Fallback? | Por qué |
|---|---|---|
| Error de red o timeout de conexión o de primer byte | Sí | Problema del upstream |
| `429` | Sí | Límite del upstream, no del cliente |
| `5xx` | Sí | Problema del upstream |
| `401` / `403` | Sí + **alerta** | Nuestra key con el upstream está mal o fue revocada |
| `402` | Sí + **alerta crítica** | **Se nos acabó el saldo con ese upstream** |
| `404` | Sí + **alerta** | Nuestro mapeo de modelo está mal |
| `400` / `422` | **No** | El request del cliente es inválido. Se devuelve sanitizado |

4. Se intentan como máximo 3 upstreams por request.
5. **Una vez que salió el primer chunk de datos, no hay reintento.** Si el upstream falla después, el cliente recibe un chunk de error ([04 · API › Streaming](./04-api.md#streaming)) y se cobra lo generado.

En el MVP la prioridad es fija. En la fase 2 se agrega un **circuit breaker**: si un upstream acumula errores en una ventana corta, baja de prioridad automáticamente durante unos minutos.

## Ocultar el upstream

El cliente nunca debe poder saber qué upstream lo atendió:

- **IDs:** `id` se reemplaza por `chatcmpl-<request_id>` y `model` por el ID de cheaptokens.wtf.
- **Campos:** solo pasan los campos del estándar de OpenAI ([04 · API › Response](./04-api.md#response)). Se descartan `usage.cost`, `provider`, `system_fingerprint` y cualquier extra, porque algunos agregadores incluyen su costo o su proveedor.
- **Headers:** no se reenvía ningún header del upstream, salvo `content-type`.
- **Errores:** el mensaje del upstream se reemplaza por uno nuestro. Para un `400`, se conserva solo la parte que le sirve al cliente (qué parámetro falló) y se quitan nombres, URLs e IDs internos.
- **Logs y dashboard del cliente:** el upstream no aparece. Solo se guarda en `requests.upstream_id`, que es interno.

## Saldo con cada upstream

- **Prepagamos poco y seguido.** La meta es no tener más de ~2 semanas de consumo prepagado en un mismo upstream, para limitar lo que perdemos si desaparece.
- **MVP:** se revisa el saldo a mano cada semana. El `402` de un upstream dispara una alerta crítica.
- **Fase 2:** un cron diario consulta el saldo de los upstreams que tengan endpoint para eso y alerta por debajo de un umbral.
- **Conciliación semanal:** se compara lo que nuestro registro dice que gastamos en cada upstream (Σ `requests.upstream_cost_micro_usd`) con lo que el upstream realmente descontó. Una diferencia grande significa que su `usage` no coincide con lo que cobra.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El upstream cierra, banea nuestra cuenta o deja de servir un modelo | El modelo deja de funcionar para todos | Dos o más upstreams en los modelos principales, interruptor de emergencia en menos de 60 s y saldo prepagado bajo |
| El upstream sube su precio | Margen negativo | El validador de margen bloquea la sincronización. La conciliación semanal detecta cambios no anunciados |
| El upstream sirve un modelo distinto o más barato que el que dice | Le vendemos al cliente algo falso y perdemos su confianza | Prueba de fidelidad al aceptarlo, pruebas periódicas en la fase 2 y salida inmediata del upstream si falla |
| **El descuento del propio upstream sale de una fuente gris** (cuentas compartidas, créditos ajenos, suscripciones revendidas) | Baneos en cadena: el upstream cae sin aviso | Due diligence al aceptarlo, diversificar y asumir que puede pasar. Por eso existen el fallback y el saldo bajo |
| Los prompts de nuestros clientes pasan por un tercero | Riesgo de privacidad y legal | Rol de intermediario declarado en los términos y en el aviso de privacidad ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)), y preferir upstreams que no retengan datos |
| El upstream cambia sus términos y prohíbe la reventa | Hay que salir de ese upstream | Revisar los términos de cada upstream una vez al mes, con dos o más upstreams por modelo |
| `usage` reportado ≠ lo que el upstream cobra | Margen real distinto del calculado | Conciliación semanal |
| Latencia extra por un salto más | Peor experiencia | Gateway en la misma región que los upstreams y sin bufferear el stream |

> **Privacidad, resuelto:** cheaptokens.wtf se declara intermediario. El aviso de privacidad nombra la *categoría* "proveedores de inferencia de terceros", sin nombres, y aclara que no guardamos contenido ([ADR-0020](./adr/0020-intermediario-entidad-mexico.md)). Un abogado mexicano valida el texto antes del lanzamiento.
