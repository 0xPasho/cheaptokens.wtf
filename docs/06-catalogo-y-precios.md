# 06 · Catálogo y precios

## Origen actual del catálogo

Desde [ADR-0046](./adr/0046-catalogo-desde-la-lista-oficial.md), `pnpm catalog:refresh` importa modelos de pago desde la lista oficial pública de InferHub. Los modelos visibles, precios de referencia y rutas proceden de `catalog/generated/`, exportados por `catalog/models.ts` y `catalog/upstreams.ts`. El reporte guarda la URL de origen, fecha y conteos de importación. `pnpm catalog:sync` sigue siendo el paso que valida y persiste la configuración en la base del gateway.

Se agrupan rutas duplicadas y se excluyen alias, pools gratuitos y entradas sin datos suficientes. Cada modelo conserva una ruta explícita y sus metadatos. Los descuentos importados cubren la mediana de sus ofertas más el margen mínimo del 10%, con un máximo de 90%. Los precios de referencia reportados por el proveedor mantienen la verificación con el creador pendiente. Los modelos retirados conservan su ID y no se publican.

## Identificadores de modelo

- **Formato:** `autor/modelo`, en minúsculas, con guiones (`anthropic/claude-haiku-4.5`, `openai/gpt-5-mini`, `google/gemini-2.5-flash`).
- **El autor es quien creó el modelo, no el upstream.** El upstream nunca aparece en el ID.
- **Los IDs son permanentes.** No se reutilizan ni se renombran. Un modelo que sale del catálogo pasa a `retired` y su ID queda reservado.
- **No hay alias** como `latest` en el MVP: el usuario sabe exactamente qué modelo está pagando.

## Qué se guarda de cada modelo

Esquema completo en [09 · Modelo de datos](./09-modelo-de-datos.md#models). Lo esencial:

| Campo | Ejemplo | Notas |
|---|---|---|
| `id` | `anthropic/claude-haiku-4.5` | Permanente |
| `name` | `Claude Haiku 4.5` | Nombre de display |
| `author` | `anthropic` | Para filtrar y para el logo |
| `description` | `{ "en": "...", "es": "..." }` | Una línea por idioma. Si falta un idioma, se usa `en` |
| `context_length` | `200000` | Tokens |
| `official_input_price` | `$1.00` / 1M | Precio del autor |
| `official_output_price` | `$5.00` / 1M | Precio del autor |
| `official_price_source_url` | URL de la página de precios del autor | Se muestra en un tooltip |
| `official_price_verified_at` | `2026-11-08` | Fecha de la última verificación |
| `discount_bps` | `9000` | 90.00% (en puntos base) |
| `tags` | `["fast", "vision", "tools", "long-context"]` | Ver [Tags](#tags) |
| `status` | `active` | Ver [Estados](#estados-de-un-modelo) |

## Precio cheaptokens.wtf

**El precio cheaptokens.wtf se deriva, no se escribe a mano** ([ADR-0010](./adr/0010-precio-por-descuento.md)):

```
precio_cheaptokens = redondear( precio_oficial × (10000 − discount_bps) / 10000 )
```

- Se calcula para input y para output con **el mismo descuento**. Así cada modelo muestra un solo porcentaje.
- Se expresa en µUSD por 1M de tokens y se redondea al µUSD más cercano ([ADR-0007](./adr/0007-dinero-en-micro-dolares.md)).
- Si el autor cambia su precio oficial, se actualiza ese campo y el precio cheaptokens.wtf se recalcula solo.

Ejemplo (ilustrativo):

| | Oficial / 1M | Descuento | cheaptokens.wtf / 1M |
|---|---|---|---|
| Input | $3.00 | 90% | **$0.30** |
| Output | $15.00 | 90% | **$1.50** |

### Qué se muestra

- **Precios por 1M de tokens**, separados para input y output, con el oficial tachado al lado.
- **Un badge con el descuento** (`−90%`).
- El precio por token solo en tooltip.
- **Moneda:** siempre USD, con formato según el idioma (`$0.30` en `en` y `0,30 US$` en `es`; ver [10 · i18n](./10-i18n.md#formatos)).

## Margen mínimo

Cada mapeo modelo → upstream guarda **lo que ese upstream nos cobra** (input y output por 1M). La sincronización del catálogo **falla** si en algún mapeo habilitado:

```
precio_cheaptokens < costo_upstream × (1 + MIN_MARGIN)
```

- `MIN_MARGIN` empieza en **10%** y se configura globalmente (está en [preguntas abiertas](./12-preguntas-abiertas.md)).
- Se valida por separado para input y para output.
- **Fase de pruebas:** fuera de producción, la validación solo **advierte**, para poder probar mapeos que todavía no tienen un costo confirmado. Con InferHub, los modelos medidos sí dejan margen ([ADR-0028](./adr/0028-inferhub-upstream-de-pruebas.md)). En producción, falla.
- **Nunca se publica en producción un precio que pierda dinero.** Si un upstream sube su precio, hay dos salidas: bajar el descuento de ese modelo o deshabilitar ese upstream.

## Costo de un request

```
costo_µUSD = ceil( (prompt_tokens × precio_input_1M + completion_tokens × precio_output_1M) / 1_000_000 )
si completion_tokens > 0:  costo_µUSD = max(costo_µUSD, MIN_CHARGE_MICRO_USD)
```

- Los precios están en µUSD por 1M y los tokens son los que reporta el upstream ([ADR-0013](./adr/0013-medicion-con-usage-upstream.md)).
- Se redondea **hacia arriba** por request. El error máximo es 1 µUSD por request.
- **Cobro mínimo:** todo request que genera salida cuesta al menos `MIN_CHARGE_MICRO_USD` = 10 µUSD ($0.00001), porque el upstream nos cobra ese mínimo. El costo oficial no lleva mínimo ([ADR-0030](./adr/0030-cobro-minimo-por-request.md)).
- Por cada request se calculan y guardan tres números: lo cobrado al cliente, lo que nos cuesta el upstream y lo que habría costado al precio oficial. Con eso salen el margen y el "ahorro" del dashboard sin recalcular con precios que pudieron cambiar.

Ejemplo con los precios de arriba y 2,000 tokens de input + 500 de output:

| | Cálculo | µUSD | USD |
|---|---|---|---|
| cheaptokens.wtf | (2,000 × 300,000 + 500 × 1,500,000) / 1M | 1,350 | $0.00135 |
| Oficial | (2,000 × 3,000,000 + 500 × 15,000,000) / 1M | 13,500 | $0.0135 |
| Ahorro del cliente | | 12,150 | $0.01215 |

### Tokens especiales en el MVP

- **Tokens de razonamiento:** vienen incluidos en `completion_tokens` y se cobran a precio de output, igual que con los proveedores oficiales.
- **Input cacheado** (`prompt_tokens_details.cached_tokens`): **en el MVP se cobra como input normal.** Es la opción conservadora mientras no sepamos cómo cobra el caché cada upstream. En la fase 2 se agrega un precio de caché por modelo.
- **Imágenes:** cuentan dentro de `prompt_tokens`, según lo que reporte el upstream.

## Tags

La lista de tags es **fija y vive en el código** ([ADR-0011](./adr/0011-tags-curados.md)). Agregar uno requiere cambiar el enum y los diccionarios de idioma. Es intencional: así no aparecen tags casi duplicados.

| Tag | `en` | `es` | Criterio | Cómo se asigna |
|---|---|---|---|---|
| `fast` | Fast | Rápido | El modelo de baja latencia y alto throughput de su familia (Haiku, Flash, mini…) | Curado |
| `reasoning` | Reasoning | Razonamiento | Soporta pensamiento extendido o razonamiento | Curado |
| `coding` | Coding | Código | Su autor lo recomienda para código o destaca en benchmarks de código | Curado |
| `vision` | Vision | Visión | Acepta imágenes como input | Curado |
| `tools` | Tools | Herramientas | Soporta function calling | Curado |
| `open-weights` | Open weights | Pesos abiertos | Sus pesos son públicos (Llama, Qwen, DeepSeek…) | Curado |
| `long-context` | Long context | Contexto largo | `context_length ≥ 200,000` | **Calculado** al sincronizar |
| `cheap` | Budget | Económico | Precio cheaptokens.wtf de output ≤ $1.00 por 1M | **Calculado** al sincronizar |

- Un modelo puede tener varios tags.
- Los tags calculados no se escriben a mano: el script de sincronización los agrega o los quita, así nunca quedan desactualizados.
- En el catálogo, los tags son chips filtrables. Varios chips seleccionados se combinan con Y.

## Estados de un modelo

| Estado | En el catálogo | En la API |
|---|---|---|
| `active` | Visible | Funciona |
| `hidden` | No aparece | Funciona (para probar antes de anunciar) |
| `deprecated` | Visible, con badge y fecha de retiro | Funciona |
| `retired` | No aparece | `410 model_retired` |

## Fuente de verdad y sincronización

([ADR-0012](./adr/0012-catalogo-en-repo.md))

- **El catálogo vive en el repo:** `catalog/models.ts` y `catalog/upstreams.ts`, tipados y validados con zod.
- **`pnpm catalog:sync`** valida todo (esquema, margen mínimo, tags, que no se borre ningún ID) y hace upsert a Postgres. Al terminar, llama a un endpoint interno protegido que ejecuta `revalidateTag('catalog', 'max')` para refrescar `/models` y `GET /v1/models`.
- **Nunca borra filas.** Si un modelo desaparece del archivo, la sincronización falla: hay que pasarlo a `retired`.
- **Interruptor de emergencia:** la columna `ops_disabled_at` de `model_upstreams` se puede poner a mano en la base (SQL en la consola de Neon) para apagar un upstream al instante. **La sincronización nunca toca esa columna**, así que un deploy no revierte una medida de emergencia.
- El gateway cachea el catálogo en memoria por 60 s, así que un cambio, incluido el interruptor de emergencia, tarda como máximo 60 s en aplicarse.

En la fase 2 se agrega un panel de admin que edita los mismos datos.
