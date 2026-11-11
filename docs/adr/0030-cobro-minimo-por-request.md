# ADR-0030: Cobro mínimo de 10 µUSD por request que genera salida

- **Estado:** Aceptada. Complementa la fórmula de costo de [06 · Catálogo](../06-catalogo-y-precios.md#costo-de-un-request) ([ADR-0010](./0010-precio-por-descuento.md)).
- **Fecha:** 2026-11-10
- **Origen:** Default (propuesto en [15 · Plan](../15-plan-gateway.md) y guardado a pedido del dueño)

## Contexto

- InferHub cobra **al menos $0.00001 (10 µUSD) por request facturado.** Los requests que fallan o no generan salida cuestan $0 ([ADR-0028](./0028-inferhub-upstream-de-pruebas.md)).
- Con la fórmula de 06, un request chico a un modelo barato se cobra en 1 o 2 µUSD y nos cuesta 10. Por ejemplo, Qwen 3.8 Flash a 85% de descuento ($0.0225 por 1M de input) llega a 10 µUSD recién con unos 440 tokens.
- Un cliente que mande miles de requests mínimos (health checks, pruebas de conexión) nos haría perder hasta 9 µUSD en cada uno.

## Decisión

- **Fórmula:**

  ```
  costo_µUSD = ceil( (prompt_tokens × precio_input_1M + completion_tokens × precio_output_1M) / 1_000_000 )
  si completion_tokens > 0:  costo_µUSD = max(costo_µUSD, MIN_CHARGE_MICRO_USD)
  ```

- **`MIN_CHARGE_MICRO_USD = 10`** ($0.00001), configurable globalmente, igual al mínimo del upstream de pruebas.
- **Solo aplica si hubo salida** (`completion_tokens > 0`), igual que InferHub. Un request sin salida se cobra con la fórmula sola.
- **`official_cost_micro_usd` no lleva mínimo:** es la referencia del "ahorro" y se calcula como siempre.
- **Se dice en `/docs`:** "Cada request con respuesta cuesta al menos $0.00001."

## Consecuencias

- Ningún request con salida nos cuesta más de lo que cobramos por culpa del mínimo del upstream.
- **En requests muy chicos a los modelos más baratos, el cobro puede superar el precio oficial.** A $0.15 por 1M, 10 µUSD equivalen a unos 67 tokens de input. El "ahorro" de esos requests sale negativo y se suma tal cual: el dashboard no lo maquilla.
- El "ahorro" de cualquier uso realista se mantiene, porque un prompt normal tiene cientos o miles de tokens.
- Si un upstream de producción no tiene mínimo, este valor se revisa con otro ADR.

## Alternativas descartadas

- **Absorber la diferencia:** pierde dinero en proporción al número de requests chicos. Es justo el patrón que un abuso puede explotar, aunque el rate limit lo acote.
- **Mínimo en todos los requests, también sin salida:** InferHub no nos cobra esos, así que sería cobrar sin costo.
- **Subir el precio por token de los modelos baratos:** castiga a todos los requests para cubrir un caso de borde, y baja el descuento que se muestra.
