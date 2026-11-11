# ADR-0001: El descuento sale de comprar tokens a plataformas agregadoras (upstreams)

- **Estado:** Aceptada
- **Fecha:** 2026-11-08
- **Origen:** Usuario

## Contexto

La propuesta de valor es vender **el mismo modelo** muy por debajo del precio oficial (por ejemplo $3.00 → $0.30 por 1M de tokens). Los proveedores oficiales no venden con ese descuento por sus canales normales: Batch API da 50% pero es asíncrona, el prompt caching solo abarata el input repetido y los acuerdos de volumen no llegan cerca del 90%. El descuento tiene que salir de otro lado, y ese origen define la arquitectura y el riesgo del negocio.

## Decisión

Compramos tokens por adelantado a **otras plataformas que exponen muchos modelos detrás de una sola URL** y venden por debajo del precio oficial. Las llamamos **upstreams**. cheaptokens.wtf se pone delante:

- Cada modelo de cheaptokens.wtf se mapea a uno o más upstreams, con su costo y su prioridad.
- El cliente nunca ve qué upstream lo atendió.
- El margen es la diferencia entre nuestro precio y el costo del upstream, y se valida por modelo ([ADR-0010](./0010-precio-por-descuento.md)).
- Solo aceptamos upstreams compatibles con OpenAI que reportan `usage` ([07 · Upstreams](../07-upstreams.md#requisitos-para-aceptar-un-upstream)).

## Consecuencias

- **La arquitectura es un proxy de formato único** (OpenAI → OpenAI): no hay traducción entre APIs de proveedores en el MVP.
- **Riesgo de contraparte:** no controlamos el precio ni la continuidad de los upstreams. Si su descuento viene de una fuente gris (cuentas compartidas, créditos ajenos), pueden caer sin aviso. Mitigación: dos o más upstreams por modelo, fallback, interruptor de emergencia y poco saldo prepagado en cada uno.
- **Riesgo de fidelidad:** un upstream podría servir un modelo distinto. Mitigación: prueba de tokenizer y de calidad antes de aceptarlo.
- **Privacidad:** los prompts de los clientes pasan por un tercero. Hay que decirlo en los términos y en la política de privacidad.
- **Operación nueva:** monitorear el saldo con cada upstream y conciliar lo que reportan contra lo que cobran.
- **Requisito agregado el mismo día:** los términos del upstream deben permitir la reventa. Por eso OpenRouter quedó descartado ([ADR-0022](./0022-openrouter-no-es-upstream.md)). Después se adoptó como upstream de la fase de pruebas ([ADR-0024](./0024-openrouter-upstream-de-pruebas.md)), y el 2026-11-10 lo reemplazó InferHub ([ADR-0028](./0028-inferhub-upstream-de-pruebas.md)).
- Toda la lógica de upstreams vive detrás de una interfaz (`select-upstream`, `upstream-fetch`). Si mañana el descuento sale de otra fuente (acuerdos directos, modelos propios), el resto del sistema no cambia.

## Alternativas descartadas

- **Pool de cuentas o suscripciones propias rotadas:** viola los términos de los proveedores, obliga a construir rotación, health checks y límites por cuenta, y un baneo tira el servicio entero.
- **Créditos de programas cloud o de startups:** se acaban y suelen prohibir la reventa. Sirven como colchón, no como modelo de negocio.
- **Subsidio (perder dinero para crecer):** sin capital no se sostiene, y subir precios después rompe la promesa del producto.
- **Ir directo a los proveedores oficiales:** sin un descuento real no hay producto. Queda como una opción futura más dentro de la misma interfaz de upstreams.
- **Hospedar modelos abiertos propios:** no es "el mismo modelo" para Claude o GPT y requiere GPUs. Podría sumarse después para modelos `open-weights`.
