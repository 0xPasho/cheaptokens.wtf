# ADR-0008: Créditos prepagados y cobro después del request

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

Nosotros pagamos a los upstreams por adelantado. Si el cliente pagara después, cada cliente que no paga sería una pérdida directa. Además, el costo de un request solo se conoce cuando termina (depende de los tokens generados).

## Decisión

- **Prepago en USD:** el usuario recarga créditos y cada request los descuenta.
- **Antes del request** solo se verifica `balance > 0` (más el límite de la key y que el workspace no esté suspendido). No hay escrituras.
- **Después del request**, en `after()`, una sola transacción inserta el request, descuenta el saldo y suma el gasto de la key.
- **El saldo puede quedar levemente negativo** por requests concurrentes. Con saldo negativo, todo request siguiente recibe `402`, y la siguiente recarga cubre primero la deuda.
- No hay suscripción, pospago ni créditos gratis ([ADR-0018](./0018-sin-creditos-gratis.md)).

Detalle en [08 · Créditos y pagos](../08-creditos-y-pagos.md).

## Consecuencias

- Sin riesgo de crédito: nunca financiamos a un cliente más allá del pequeño negativo.
- Hot path sin escrituras antes del upstream: menos latencia.
- **Exposición acotada pero real:** ≈ requests en vuelo × costo máximo por request. El rate limit la contiene ([ADR-0017](./0017-rate-limit-upstash.md)).
- Hace falta un cron diario de conciliación para verificar el invariante del saldo.

## Alternativas descartadas

- **Reserva previa (hold):** retener `max_tokens × precio` antes del request y liquidar al final. Evita el saldo negativo, pero exige estimar el input, manejar `max_tokens` ausentes y liberar reservas huérfanas cuando una función muere. Se reconsidera si el negativo se vuelve un problema real.
- **Suscripción mensual con cuota:** el uso de los LLMs es muy variable. Una cuota fija o le cobra de más al usuario o nos deja expuestos.
- **Pospago con factura:** riesgo de crédito directo, cuando nosotros ya prepagamos a los upstreams.
- **Débito antes del request con un costo estimado:** el costo real siempre difiere, así que igual habría que ajustar después. Es la reserva previa con más pasos.
