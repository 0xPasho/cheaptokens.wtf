# ADR-0009: Stripe Checkout para recargas

- **Estado:** Reemplazada por [ADR-0019](./0019-merchant-of-record.md) el 2026-11-08: se eligió un Merchant of Record. Se conserva como **plan B** si ningún MoR aprueba el negocio.
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Las recargas de créditos ([ADR-0008](./0008-creditos-prepagados.md)) necesitan un procesador de pagos global, con tarjetas, recibos, antifraude y webhooks confiables. El producto es para todo el mundo, así que los impuestos al consumidor (IVA, GST, sales tax) son parte de la decisión.

## Decisión

- **Stripe Checkout** en modo `payment`, con montos de $10–$1,000.
- El saldo se suma **solo** desde el webhook `checkout.session.completed` (con `payment_status = paid`), de forma idempotente por `session.id`.
- **Stripe Radar** para antifraude. `charge.dispute.created` suspende el workspace.
- Solo tarjeta en el MVP.
- **Impuestos:** Stripe Tax, *pendiente de confirmar*.

## Consecuencias

- Checkout alojado por Stripe: no tocamos datos de tarjeta, y los wallets (Apple Pay, Google Pay) vienen incluidos.
- Los recibos los manda Stripe.
- **Con Stripe somos el vendedor legal:** registrarse para cobrar impuestos en cada jurisdicción donde se superen los umbrales es responsabilidad nuestra. Esa es la razón por la que el ADR está en *Propuesta*.
- La comisión fija por cargo obliga a una recarga mínima de $10.

## Alternativas descartadas (por ahora)

- **Merchant of Record (Paddle, Lemon Squeezy, Polar):** resuelve los impuestos globales, porque ellos son el vendedor legal. Cobra una comisión más alta y hay que confirmar que acepta este modelo de negocio. **Es la alternativa principal si la pregunta abierta 1 se resuelve a su favor.** En ese caso, este ADR se reemplaza.
- **Mercado Pago u otros procesadores regionales:** sirven para un mercado, no para uno global. Se pueden sumar después como método local.
- **Cripto:** suma complejidad contable y regulatoria. No es lo que pide un dev promedio.
