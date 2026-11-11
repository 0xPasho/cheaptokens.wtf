# ADR-0017: Rate limit por workspace con Upstash Redis

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Default

## Contexto

El cobro después del request ([ADR-0008](./0008-creditos-prepagados.md)) permite un saldo levemente negativo, proporcional a los requests en vuelo. Además hay que proteger nuestro saldo con los upstreams frente a una key filtrada o un bucle mal programado. En serverless, el estado en memoria no se comparte entre instancias, así que un contador local no sirve.

## Decisión

- **Rate limit por workspace** (no por key, para que multiplicar keys no multiplique el límite), con **Upstash Redis** y `@upstash/ratelimit` en ventana deslizante.
- **Valor inicial:** 60 requests por minuto, con override por workspace en `workspaces.rate_limit_rpm`.
- Al excederlo: `429 rate_limit_exceeded` con `retry-after`.
- Se consulta en paralelo con el lookup de la key, para no sumar latencia en serie.
- **Si Redis no responde, el request pasa** (fail-open) y se registra. Una caída de Redis no debe tirar la API.

## Consecuencias

- La exposición por saldo negativo queda acotada.
- Una pieza más de infraestructura, aunque serverless y sin servidor que operar.
- Fail-open significa que durante una caída de Redis no hay límite. Es aceptable porque el saldo sigue siendo la barrera principal.
- Base para la fase 2: límite de requests concurrentes y límites por key.

## Alternativas descartadas

- **Contar en Postgres:** una escritura o un conteo más por request en la base que ya lleva el dinero. Además, las filas de `requests` se insertan al terminar, así que los requests en vuelo no se contarían.
- **Rate limit en memoria por instancia:** con varias instancias, el límite real sería N veces el configurado.
- **El firewall o rate limit de Vercel:** limita por IP, no por workspace ni por key.
- **Sin rate limit en el MVP:** deja sin acotar la exposición por saldo negativo y por keys filtradas.
