# ADR-0052: Plus, Pro y Max cuestan $9, $39 y $99 al mes

- **Estado:** Aceptada. Cambia los precios y los límites de [ADR-0049](./0049-suscripcion-con-limites.md); lo demás de ADR-0049 se mantiene.
- **Fecha:** 2026-11-17
- **Origen:** Usuario (los precios) + Default (los límites)

## Contexto

- [ADR-0049](./0049-suscripcion-con-limites.md) puso los planes en $20, $50 y $150 al mes, con valores iniciales.
- El dueño pidió bajarlos a $9, $39 y $99.
- Los límites de ADR-0049 eran proporcionales al precio: la semana era el 60 % y la ventana de 5 horas entre el 12.5 % y el 14.7 %. Los planes de socio ya usan 14 % y 60 % ([17 · Puerta de socios](../17-puerta-de-socios.md#planes-de-socio)).
- Bajar el precio sin tocar los límites empeoraría el margen: Plus daría ≈ $52 de uso al mes por $9.

## Decisión

| Plan | Precio al mes | Ventana de 5 horas | Semana | Requests por minuto |
|---|---|---|---|---|
| Plus | $9 | $1.26 | $5.40 | 60 |
| Pro | $39 | $5.46 | $23.40 | 120 |
| Max | $99 | $13.86 | $59.40 | 300 |

- **La ventana es el 14 % del precio y la semana el 60 %,** en los tres planes. Es la misma regla que en los planes de socio.
- Los valores viven en `src/lib/billing/plans.ts`.
- El rate limit, los paquetes, los créditos y el orden de cobro no cambian.

## Consecuencias

- **El margen por dólar cobrado queda igual que en ADR-0049:** un plan usado al máximo da ≈ 2.6 veces su precio en uso al mes, y solo cubre su costo si el costo upstream es ≤ ~38 % del precio cheapllm.wtf. Sigue pendiente calibrarlo ([12 · pregunta 10](../12-preguntas-abiertas.md#10-calibrar-los-límites-de-los-planes-y-el-margen)).
- **Cada plan da menos uso que antes** en términos absolutos. La ventana de Plus ($1.26) alcanza para pocas requests largas con los modelos caros.
- **La comisión del MoR pesa más en Plus:** con 4 % + 40¢, un cobro de $9 pierde $0.76 (8.4 %).
- Plus y Max quedan con los mismos límites que `plan-9` y `plan-99` de socios, salvo el rate limit de Max (300 contra 200).

## Alternativas descartadas

- **Bajar el precio y conservar los límites de ADR-0049:** el costo upstream tendría que ser ≤ ~17 % del precio en Plus para no perder.
- **Conservar la proporción de ventana de cada plan (12.5 %, 14 %, 14.7 %):** tres reglas para una diferencia de centavos.
