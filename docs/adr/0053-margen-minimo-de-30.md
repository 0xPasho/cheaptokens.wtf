# ADR-0053: El margen mínimo sobre el costo del upstream sube de 10 % a 30 %

- **Estado:** Aceptada. Cambia el valor de `MIN_MARGIN` de [ADR-0010](./0010-precio-por-descuento.md) y de [ADR-0046](./0046-catalogo-desde-la-lista-oficial.md); la fórmula y la validación no cambian.
- **Fecha:** 2026-11-17
- **Origen:** Usuario

## Contexto

- El catálogo se genera con el mayor descuento que cumple `precio cheapllm.wtf ≥ costo × (1 + MIN_MARGIN)`. Con 10 %, el margen bruto mediano era 10.6 % del precio de venta.
- Ese margen no cubre la comisión del cobrador: con 4 % + 40¢, una recarga de $10 pierde 8 %.
- InferHub retiene el 20 % de cada cobro (su página principal, 2026-11-17), pero sale de lo que recibe el vendedor: ya está dentro del costo que nos cobra. Su saldo se fondea por adelantado y no es reembolsable.
- Se probó primero 50 %. El dueño lo bajó a 30 % el mismo día para que el descuento siga siendo atractivo.

## Decisión

- **`MIN_MARGIN_BPS = 3_000`** en `src/lib/catalog/validate.ts`: todo precio publicado es ≥ costo × 1.3, en input y en output.
- El catálogo se regeneró con `pnpm catalog:refresh` el 2026-11-17, con los asks de InferHub de ese momento.

## Consecuencias

- **Margen bruto ≈ 23 % del precio de venta** (0.3 / 1.3), antes de la comisión del cobrador. En una recarga de $10 quedan unos $1.50 después de ella.
- **Descuentos:** mediana de 67 % (mínimo 35 %, máximo 90 %) en 94 modelos activos. Output por 1M: Claude Opus 5.5 $3.80 (−81 %), Claude Sonnet 5.5 $2.90 (−71 %), Claude Fable 5.2 $18.40 (−54 %), GPT 6.1 Sol $3.30 (−67 %).
- **Los asks de InferHub se mueven en horas:** entre el 12 y el 17 de noviembre el costo de Opus 5.5 subió de $2.18 a $2.80 y el de Sonnet 5.5 de $1.60 a $2.20. El mismo 17, con una hora de diferencia, GPT 6.1 Sol pasó de $3.00 a $2.51 y la lista de 512 a 488 entradas. Un catálogo regenerado a mano queda viejo pronto.
- **Los planes usados al máximo siguen perdiendo:** necesitan un costo ≤ ~38 % del precio y con este margen es ≈ 77 %. Sigue abierta la [pregunta 10](../12-preguntas-abiertas.md#10-calibrar-los-límites-de-los-planes-y-el-margen). Los paquetes (20 % extra) cuadran por poco: exigen ≤ 83 %.
- **Hay que correr `pnpm catalog:sync`** para llevar los precios nuevos a la base de datos del gateway.
- El catálogo de pruebas (`tests/fixtures/`) bajó tres descuentos para cumplir el margen: Haiku 4.5 a 70 %, Qwen 3.8 Flash y DeepSeek V4.1 Flash a 82 %.

## Alternativas descartadas

- **50 %:** más ganancia por request, pero descuentos menos vistosos.
- **160 %:** es lo que haría cuadrar los planes al máximo, pero varios modelos quedarían casi a precio oficial.
