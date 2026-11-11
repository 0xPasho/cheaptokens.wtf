# ADR-0007: Dinero como enteros en micro-dólares

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Los costos por request son diminutos (un request típico cuesta fracciones de centavo), y los precios por token tienen 7 u 8 decimales. Los floats acumulan errores de redondeo, y en un ledger cualquier diferencia hace que la conciliación no cuadre.

## Decisión

- Todo el dinero se guarda como **`bigint` en µUSD** (1 USD = 1,000,000 µUSD), en columnas con sufijo `_micro_usd`.
- Los precios del catálogo van en **µUSD por 1M de tokens**: $0.30 / 1M = `300000`.
- Costo de un request: `ceil((prompt_tokens × precio_input + completion_tokens × precio_output) / 1_000_000)` en µUSD, redondeado hacia arriba.
- En TypeScript se opera con `bigint`, y la conversión a USD ocurre solo para mostrar.
- La API pública expresa los precios como strings decimales (`"0.30"`).

## Consecuencias

- La aritmética es exacta y la conciliación da 0 de diferencia.
- El error máximo por redondeo es 1 µUSD por request ($0.000001), siempre a favor de cubrir el costo.
- `bigint` alcanza para ~9.2 billones de USD: no hay riesgo de overflow.
- Hay que tener cuidado en JS: `bigint` y `number` no se mezclan, y `JSON.stringify` no serializa `bigint`. Las respuestas de la API usan strings.

## Alternativas descartadas

- **Centavos (enteros):** no alcanza la precisión. Muchos requests cuestan menos de un centavo.
- **`numeric` / `decimal` de Postgres:** es exacto, pero en JS llega como string o hay que pasarlo por una librería decimal. Los enteros son más simples y rápidos.
- **Floats (`double`):** acumulan errores de redondeo. Inaceptable para dinero.
- **Nano-dólares:** más precisión de la que necesitamos, a cambio de números más grandes en todas partes.
