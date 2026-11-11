# ADR-0029: El catálogo de pruebas usa cuatro modelos que InferHub sirve de verdad

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Origen:** Default (propuesto en [15 · Plan](../15-plan-gateway.md) y guardado a pedido del dueño)

## Contexto

- El catálogo de ejemplo tiene 10 modelos (`CATALOG_IS_SAMPLE`). **Solo uno existe en InferHub:** Claude Haiku 4.5, como `ant/claude-haiku-4-5` y `kiro/claude-haiku-4.5` ([ADR-0028](./0028-inferhub-upstream-de-pruebas.md)).
- [07 · Upstreams](../07-upstreams.md#inferhub-en-la-fase-de-pruebas) pide un catálogo de pruebas de 3 a 5 modelos de distintos autores y tags.
- **Haiku pierde dinero con su descuento actual:** a 90%, su precio es $0.10 / $0.50 por 1M, y el costo medido en InferHub es $0.199 / $0.995.
- La landing y el catálogo tienen capturas de Playwright: cualquier modelo visible nuevo las cambia.

## Decisión

| ID cheaptokens.wtf | En InferHub | Oficial (in / out por 1M) | Costo del mapeo (tope) | Descuento | Estado | Tags curados |
|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-4.5` | `ant/claude-haiku-4-5` | $1.00 / $5.00 | $0.199 / $0.995 | **78%** (era 90%) | `active` | `fast`, `vision`, `tools` (ya los tiene) |
| `qwen/qwen3.8-flash` | `alicn/qwen3.8-flash` | $0.15 / $0.47 | $0.01755 / $0.05499 | 85% | `hidden` | `fast`, `vision` |
| `deepseek/deepseek-v4.1-flash` | `alicn/deepseek-v4.1-flash` | $0.15 / $0.60 | $0.01755 / $0.0702 | 85% | `hidden` | `fast`, `reasoning`, `tools`, `vision` |
| `z-ai/glm-5.3-flash` | `zai/glm-5.3-flash` | $0.15 / $0.50 | $0.00645 / $0.0215 | 85% | `hidden` | `fast`, `reasoning`, `vision` |

- **Haiku baja a 78%,** el descuento máximo que deja el 10% de margen (`MIN_MARGIN`) sobre su costo.
- **Los otros tres van como `hidden`:** funcionan en la API, pero no aparecen en `/models` ni en la landing.
- **Contexto:** 200,000 tokens en Haiku y 1,000,000 en los otros tres, según `GET /v1/models` de InferHub. `long-context` y `cheap` los calcula la sincronización.
- **Precio oficial:** se toma de los campos `official_in` / `official_out` de InferHub, con `officialPriceVerifiedAt: null`, hasta verificarlo en la página del autor ([06](../06-catalogo-y-precios.md)).
- **Costo del mapeo:** en Haiku y Qwen es el ask que se midió. En DeepSeek y GLM es su segundo ask, sin medir. El tope de precio garantiza que InferHub nunca cobre más ([ADR-0028](./0028-inferhub-upstream-de-pruebas.md)).
- **Los otros nueve modelos de ejemplo** quedan sin mapeo y responden `503 no_upstream_available`.
- **Las pruebas en vivo** usan `qwen/qwen3.8-flash` con `reasoning_effort: "none"`.

## Consecuencias

- El gateway se puede probar con cuatro modelos reales de tres autores, con y sin razonamiento, sin tocar la apariencia del sitio, salvo el descuento de Haiku.
- **Cambian las capturas de la landing y del catálogo** por el 78% de Haiku. Se regeneran con `pnpm test:e2e:update` y se revisan.
- **Los asks se mueven:** el mismo 2026-11-10, Haiku pasó de tener su ask más bajo en $0.199 a tenerlo en $0.198. Antes de cada sincronización se revisa `GET /v1/models`.
- Si a un tope no hay vendedor disponible, el modelo responde con error hasta subir el costo del mapeo o bajar el descuento.
- Cuando se defina el catálogo de lanzamiento ([12 #1](../12-preguntas-abiertas.md#1-elegir-los-upstreams-de-producción)), este se reemplaza con otro ADR.

## Alternativas descartadas

- **Reemplazar todo el catálogo de ejemplo con modelos de InferHub:** cambiaría la landing por un catálogo que tampoco es el de lanzamiento.
- **Dejar Haiku en 90%:** cada request perdería dinero, y la validación de margen advertiría en cada sincronización.
- **Los cuatro modelos visibles:** cambiaría las capturas y mostraría en público modelos que solo existen para probar.
- **Mapear `kiro/claude-haiku-4.5`:** su `usage` parece estimado (caracteres ÷ 4), y para probar el cobro necesitamos tokens contados.
