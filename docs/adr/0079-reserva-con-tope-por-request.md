# ADR-0079: La salida mínima de una reserva baja a 256 tokens y una key de solo plan reserva como mucho media ventana

- **Estado:** Aceptada. Reemplaza el mínimo de 1 024 tokens de salida de [ADR-0066](./0066-reserva-por-request.md) y le agrega un tope por request a las keys `plan_only`. El resto de ADR-0066 no cambia.
- **Fecha:** 2026-11-24
- **Origen:** Usuario (bajar el mínimo y poner un tope por request, para que un stream colgado no bloquee a los demás) + Default (256 tokens, media ventana de 5 horas y solo en keys `plan_only`)

## Contexto

- El 24 de noviembre, dos clientes de Deska con `plan-3` ($0.42 por ventana de 5 horas) recibieron 84 `429 usage_limit_reached` corriendo Deska Harness con Claude Fable 5.1. Pi reintenta cada 429 tres veces, así que fueron unas 21 vueltas bloqueadas.
- Una vuelta de Pi manda unos 23 000 tokens y `max_tokens: 16384`. A los precios de reserva de Fable 5.1 ($5.90 de entrada y $29.50 de salida por millón), el prompt estimado reserva unos $0.118 y la salida pedida $0.48: más que la ventana entera.
- **La salida pedida se recorta a lo que alcanza,** así que la primera vuelta de una ventana reserva todo lo que queda. Mientras corre, cualquier otra vuelta del mismo plan recibe 429. Dos de esos 429 pasaron mientras un stream estaba colgado en InferHub, de 49 a 51 s.
- **El mínimo de 1 024 tokens de salida** pedía unos $0.148 libres para admitir una vuelta. Al final de cada ventana quedaban entre $0.06 y $0.15 que ninguna vuelta podía usar.

## Decisión

- **`MIN_OUTPUT_TOKENS` baja de 1 024 a 256** (`src/lib/gateway/request-cost.ts`). Se aplica a toda key: si ni el prompt con 256 tokens de salida cabe, se rechaza como antes.
- **Una key `plan_only` no reserva más de la mitad de la ventana de 5 horas de su plan** (`fiveHourLimitMicroUsd / 2`, en `src/lib/gateway/admission.ts`). Si el costo máximo del request pasa ese tope, se recorta la salida, y el upstream recibe el `max_tokens` recortado con `finish_reason: "length"`, como cualquier recorte de ADR-0066.
- **El tope nunca rechaza y nunca recorta por debajo del mínimo.** Si el prompt con 256 tokens ya pasa el tope, se reserva eso. Solo rechaza el presupuesto real.
- **No aplica a `plan_then_prepaid` ni a `prepaid_only`:** esas keys tienen créditos o paquetes que cubren el segundo request cuando el plan ya está reservado.
- **No aplica con `fullOutput`** (`/anthropic/v1/messages`, [ADR-0078](./0078-formato-anthropic-para-claude-code.md)): ahí una salida que no cabe entera se rechaza en vez de recortarse, y el tope la recortaría. Está en `reserveRequest` (`src/lib/gateway/admission.ts`), que comparten los dos endpoints.

## Consecuencias

- Una ventana recién abierta siempre deja lugar para al menos dos requests a la vez, aunque uno esté colgado en el upstream o pida la salida máxima.
- En `plan-3` con Fable 5.1, el tope son $0.21: una vuelta de unos 20 000 tokens estimados puede escribir hasta unos 3 100 tokens. Una vuelta que escriba un archivo más largo sale cortada con `finish_reason: "length"`, y Pi tiene que seguir en la vuelta siguiente. Con Sonnet 4.6 o Gemini 4 Neon, el tope de `plan-3` no corta los 16 384 tokens de Pi. Desde `plan-9` ($0.63 de tope) tampoco corta con Fable.
- Admitir una vuelta de Fable en `plan-3` pide unos $0.126 libres en vez de $0.148. Cabe una vuelta más al final de algunas ventanas, nunca más de una.
- Al final de la ventana, más respuestas salen recortadas a 256 tokens en vez de rechazadas. Un cliente que no maneje `finish_reason: "length"` ve una respuesta incompleta en lugar de un 429.
- La pérdida por request sigue acotada como en ADR-0066: el tope solo reserva menos porque también pide menos salida al upstream.

## Alternativas descartadas

- **Reservar menos de lo que se le pide al upstream:** deja que el request cruce el límite y la diferencia termina en `absorbed_micro_usd`, que es lo que ADR-0066 cerró.
- **Un tope fijo de tokens de salida para todos:** cortaría la salida también en planes grandes y en créditos, donde no hay ventana que repartir.
- **La mitad de lo que queda en vez de la mitad de la ventana:** cada request achicaría al siguiente, y una ventana a medio usar cortaría la salida aunque nadie más estuviera corriendo.
- **Dejar el mínimo en 1 024:** pierde una vuelta casi en cada ventana chica. Con 256, una vuelta típica de Pi (de 30 a 60 tokens de salida, medido el 24 de noviembre) sigue cabiendo.
