# ADR-0011: Lista fija de tags: curados y calculados

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Usuario (clasificar modelos, por ejemplo `fast`) + Default (lista fija y criterios)

## Contexto

Los usuarios deben poder encontrar el modelo adecuado sin leer benchmarks, por ejemplo uno rápido (`fast`, como Claude Haiku). Sin reglas, los tags se multiplican, se duplican (`fast` / `quick` / `low-latency`) y pierden significado.

## Decisión

- **Lista fija en el código** (un enum), con su etiqueta traducida en los diccionarios: `fast`, `reasoning`, `coding`, `vision`, `tools`, `open-weights`, `long-context`, `cheap`.
- **Cada tag tiene un criterio escrito** ([06 · Catálogo › Tags](../06-catalogo-y-precios.md#tags)).
- **Seis tags se curan a mano**, porque dependen de juicio o de capacidades declaradas.
- **Dos se calculan** al sincronizar, porque dependen de datos que ya tenemos: `long-context` (`context_length ≥ 200,000`) y `cheap` (precio cheaptokens.wtf de output ≤ $1.00 por 1M).
- Un modelo puede tener varios tags. En el catálogo los filtros se combinan con Y.

## Consecuencias

- Los tags tienen un significado estable y se pueden traducir.
- Los calculados nunca se desactualizan cuando cambian los precios o el contexto.
- Agregar un tag requiere un cambio de código y de diccionarios. Es intencional.
- Los criterios curados como `coding` o `fast` siguen siendo juicio editorial y conviene revisarlos al agregar modelos.

## Alternativas descartadas

- **Tags libres en la base:** generan duplicados, no tienen traducción y no tienen criterio.
- **Todo calculado a partir de benchmarks o latencias medidas:** requiere datos que no tenemos al lanzar y cambia con la carga de los upstreams.
- **Separar "capacidades" (vision, tools) de "tags":** es más correcto en teoría, pero para el usuario los dos son filtros. Se puede separar internamente más adelante sin cambiar la interfaz.
