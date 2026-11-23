# ADR-0070: El hero dice «Paga menos por más tokens de IA», muestra el ahorro junto al precio y deja la base URL para más abajo

- **Estado:** Aceptada. Actualiza el hero de la landing ([ADR-0060](./0060-landing-explica-el-producto.md)).
- **Fecha:** 2026-11-22
- **Origen:** Usuario (título, subtítulo, qué se quita, dónde va el ahorro y los cuatro modelos con su orden) + Default (cuál Gemini es el último)

## Contexto

El hero decía «Paying the official price is optional.», una frase que no dice qué vendemos. Debajo había mucha información:

- un subtítulo con el conteo de modelos y laboratorios y «Same model, same code, smaller bill»;
- el nombre del modelo, que ya está en el selector;
- la unidad «per 1M output tokens»;
- el ahorro en una línea propia;
- una píldora con la base URL.

Con tanto texto, el precio grande perdía fuerza.

## Decisión

- **Título:** «Pay less for more AI tokens.» / «Paga menos por más tokens de IA.». No lleva una cifra fija, porque el descuento cambia según el modelo.
- **Subtítulo:** «All your AI models in one endpoint.» / «Todos tus modelos de IA en un solo endpoint.».
- **Precio:** el oficial tachado arriba a la izquierda con el ahorro en verde debajo («You save $X (−N %)»), y el nuestro en grande a la derecha. La línea del ahorro comparte la línea base del precio grande, así que no ocupa una línea propia. En pantallas angostas los tres van uno debajo del otro.
- **Se quitan** la leyenda (nombre del modelo y «per 1M output tokens») y la base URL. «Un solo endpoint» ya está en el subtítulo, y la URL está en «Migrar» y en `/docs`.
- **Modelos del selector, en este orden:** DeepSeek V4.1 Flash (el más barato, el que se ve al cargar), Claude Opus 5.5, GPT 6.2 Sol y el último Gemini, que hoy es Gemini 4 Neon (`HERO_MODELS` en `src/lib/marketing.ts`).
- **Se quedan** el selector, los dos botones y la órbita de logos.

## Consecuencias

- El hero ocupa unos 60 px menos y el precio es lo único grande debajo del título.
- El catálogo no guarda fechas de lanzamiento, así que «el último Gemini» se elige a mano: cuando salga uno nuevo, se cambia su ID en `HERO_MODELS`. Si un ID sale del catálogo, ese modelo simplemente no se muestra.
- Los diccionarios pierden `home.hero.baseUrl` y `home.hero.perMillion`.

## Alternativas descartadas

- **Mantener «Paying the official price is optional.»:** no dice qué es el producto.
- **«Los mismos modelos de IA, más baratos.», «Claude, GPT y Gemini. Más baratos.», «Paga menos por la misma IA.»:** se propusieron y el usuario prefirió su propia frase.
- **Un título con «a mitad de precio» u otra cifra:** sería falso para los modelos con menos descuento.
- **Una etiqueta «−N %» en la esquina del precio grande:** más limpia, pero se pierde el monto en dólares.
- **El descuento dentro de cada píldora del selector:** recarga el selector y separa el ahorro del precio.
- **La base URL como texto pequeño bajo los botones:** sigue compitiendo con el precio, y quien la necesita la encuentra en «Migrar» y en `/docs`.
