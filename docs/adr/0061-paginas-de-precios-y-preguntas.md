# ADR-0061: Precios y preguntas frecuentes tienen página propia: `/[lang]/pricing` y `/[lang]/faq`

- **Estado:** Aceptada. Amplía el mapa de páginas de [02 · Producto y UX](../02-producto-y-ux.md#mapa-de-páginas).
- **Fecha:** 2026-11-17
- **Origen:** Usuario (subpáginas además de la landing, por ejemplo una de preguntas frecuentes) + Default (que la otra sea Precios, las rutas y el contenido)

## Contexto

- La landing ([ADR-0060](./0060-landing-explica-el-producto.md)) tiene que seguir siendo corta. Lo que no cabe ahí, como cuánto gasta cada modelo del límite o las dudas de pagos, solo estaba en el dashboard y en los docs internos.
- Las rutas públicas están en inglés (`/models`, `/docs`, `/dashboard`) y llevan el idioma delante ([10 · i18n](../10-i18n.md)).

## Decisión

### `/[lang]/pricing`

En este orden:

1. **Planes y créditos:** las mismas tarjetas de la landing, con el selector que cambia el modelo con el que se calculan las requests típicas (`ESTIMATOR_MODELS`; por defecto Claude Sonnet 5.5, el de referencia del dashboard).
2. **Cómo se reparte un request** entre plan y créditos, con el tope del excedente por defecto.
3. **Lo que gasta cada modelo:** una tabla con doce modelos (`USAGE_TABLE_MODELS`): precio de entrada y salida con el oficial tachado, request típica, multiplicador frente a Sonnet 5.5 y requests en la ventana de Pro. Es la cuenta de «Consumo por modelo» del dashboard (`typicalCost`, `usageMultiplier`).
4. **Cómo pagas:** los tres pasos del depósito en USDC ([ADR-0058](./0058-deposito-por-cuenta-y-saldo.md)).
5. **Cinco preguntas de cobro** (`PRICING_FAQ`) y un link a `/faq`.
6. El cierre de la landing.

### `/[lang]/faq`

- **27 preguntas en seis temas** (`FAQ_TOPICS` en `src/lib/marketing.ts`): el producto, precios y cobro, planes y límites, pagos, API y compatibilidad, y privacidad y cuenta. A la izquierda, los temas con su número de preguntas; en móvil, como chips arriba.
- **El texto vive en `faq.items` del diccionario; el orden y los temas, en el código.** La landing (`HOME_FAQ`) y `/pricing` (`PRICING_FAQ`) eligen preguntas por su id. Una prueba exige que cada pregunta esté en un solo tema.
- **Los valores de las respuestas salen del código** (`faqValues`): el número de autores, el depósito mínimo, el precio y el rate limit de cada plan. El `código` entre backticks se muestra con `RichText`, como en `/docs`.
- **Las respuestas salen de los docs y los ADRs**, sin prometer nada que no esté construido: 02, 04, 05 y 08, y los ADR 0014, 0018, 0020, 0054 y 0058.

### Navegación

- «Precios» va en la cabecera. «Preguntas frecuentes» va en el footer y en los links de la landing y de `/pricing`.
- Las dos páginas son estáticas y leen el catálogo en vivo, igual que `/models`, con su `title` y `description` por idioma.

## Consecuencias

- **Cada cambio de planes, depósitos o rate limit se refleja solo en los números,** pero el texto de las respuestas hay que revisarlo a mano cuando cambie una regla (por ejemplo, al sumar tarjeta como medio de pago).
- **El sitemap, cuando exista ([16](../16-plan-sitemap.md)), tiene que incluir `/pricing` y `/faq`.**
- `/faq` es candidata a datos estructurados (`FAQPage`) para buscadores. No se hizo todavía.

## Alternativas descartadas

- **Rutas en español (`/precios`, `/preguntas`):** el resto del sitio usa rutas en inglés con el idioma delante.
- **Todo en la landing:** se vuelve una página larga, que es justo lo que la landing evita.
- **Las preguntas como un arreglo por tema en el diccionario:** cada idioma tendría que repetir el orden y los ids, y la landing no podría elegir preguntas por nombre.
- **Llevar las preguntas a `/docs`:** los docs explican la API; las dudas de cobro y pagos son de quien todavía no se registra.
