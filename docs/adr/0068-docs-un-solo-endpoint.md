# ADR-0068: La docs gira alrededor de un solo endpoint y se ordena en empezar, usar y referencia

- **Estado:** Aceptada. Reemplaza el orden de [02 · Producto y UX › Docs](../02-producto-y-ux.md#docs-langdocs) («base URL, autenticación, ejemplo, streaming, modelo, errores y herramientas»).
- **Fecha:** 2026-11-22
- **Origen:** Usuario (la idea central) + Default (el resto, en un grilling del 2026-11-22)

## Contexto

- `/docs` se escribió antes de los planes ([ADR-0049](./0049-suscripcion-con-limites.md)), del cobro por costo real ([ADR-0054](./0054-cobro-por-costo-real.md)) y de la reserva por request ([ADR-0066](./0066-reserva-por-request.md)). Su sección de cobro decía «pagas por token con créditos prepagados, al precio del modelo» y no mencionaba los planes.
- Faltaba lo que más confunde al usuario: que sin `max_tokens` se piden 32 768 tokens y que, si el saldo o el plan no alcanzan, la salida se recorta (`finish_reason: "length"`). Tampoco explicaba cómo conseguir una key, la fuente de cobro de una key, los headers `x-usage-*`, el rate limit por plan ni qué parámetros funcionan.
- La tabla de errores tenía 15 filas sin «qué hago», y el streaming crudo (SSE, keep-alive, error a mitad del stream) ocupaba más espacio que el cobro, aunque casi todos usan el SDK.
- Cada bloque de código medía 320 px fijos: una URL de una línea era una caja enorme.

## Decisión

- **La idea central es una sola:** un endpoint, con el formato de OpenAI. La descripción de la página lo dice y debajo va un recuadro con la base URL, el endpoint, la autenticación, el formato y `GET /v1/models`. Con eso basta si ya usas el SDK de OpenAI.
- **El lector principal** es quien ya usa el SDK de OpenAI. Los editores y agentes quedan en la tabla de herramientas, sin recetas por herramienta hasta probarlas ([ADR-0062](./0062-lo-que-el-sitio-promete.md)).
- **Una sola página, con índice lateral fijo y tres bloques** (el índice se oculta por debajo de 1024 px):
  - **Empezar:** antes del primer request (cuenta, saldo o plan, key; se paga con cripto y no hay créditos de prueba) y el primer request, con el aviso de `max_tokens`.
  - **Usar:** cómo elegir modelo, qué funciona (tabla de funciones, lo que todavía no existe y las herramientas), streaming, cuánto pagas (con los headers del plan), API keys (fuente de cobro, límite, modelos, rotar, revocar) y rate limit por plan.
  - **Referencia:** problemas comunes por síntoma, errores agrupados con «qué pasó y qué hacer», y el formato exacto del stream.
- **El dinero, solo lo que afecta al código:** que el precio publicado es el máximo, qué tokens se cuentan, el mínimo, la reserva y el recorte, el stream cancelado y que los errores no se cobran. Los planes y sus precios se quedan en `/pricing`. No se dice el margen ni el proveedor ([ADR-0062](./0062-lo-que-el-sitio-promete.md)).
- **Las cifras salen del código, no del texto:** el rate limit de cada plan (`PLANS`, `DEFAULT_RATE_LIMIT_RPM`), la salida por defecto y la mínima (`DEFAULT_MAX_OUTPUT_TOKENS`, `MIN_OUTPUT_TOKENS`), el cobro mínimo, los códigos de error y los ejemplos de SSE. Las fuentes de cobro usan las mismas etiquetas del dashboard. Así la página no se vuelve a desfasar con el próximo ADR de cobro.
- **Sin personalizar:** la página sigue estática; con o sin sesión se ve `wtf_...`.
- **Los bloques de código de `/docs` miden lo que su contenido,** hasta 30 rem.

## Consecuencias

- Un cambio de plan, de rate limit o de la reserva se ve en `/docs` sin tocar el texto. Un código de error nuevo no compila hasta tener grupo (`ERROR_GROUP` es un `Record` de todos los códigos) y texto en los dos idiomas.
- La página es más larga que antes en texto, pero más corta en pantalla: los bloques de código ya no ocupan 320 px cada uno.
- El FAQ todavía responde algunas preguntas que también están aquí (cobro de los fallos, rate limit, límite de una key). Si una de las dos cambia, hay que revisar la otra.

## Alternativas descartadas

- **Varias páginas (`/docs/billing`, `/docs/errors`…):** mejor para buscar y enlazar, pero hoy el contenido cabe en una página con índice y cada página nueva pide navegación propia.
- **Explicar todo el cobro (ventanas, excedente, orden de cobro):** eso ya está en `/pricing` y en el FAQ. Repetirlo aquí era otra copia que se desfasa.
- **Recetas por editor o agente:** ADR-0062 pide no anunciar lo que no se probó.
- **Mostrar saldo, plan o la key con la sesión iniciada:** obliga a renderizar en cada request o a cargar datos en el navegador, para algo que el dashboard ya muestra.
- **Una columna «¿Se cobra?» en la tabla de errores:** hubiera dicho «No» en las 15 filas. Basta una frase con la única excepción (un `400` en el que el modelo reporta tokens).
